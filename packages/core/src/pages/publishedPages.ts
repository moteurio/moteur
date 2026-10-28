import type { CollectionPage, PageNode, StaticPage } from '@moteurio/types/Page.js';
import type { User } from '@moteurio/types/User.js';
import { addAndCommit, getLog, isGitRepo, readBlobs } from '../git/gitService.js';
import * as publishedCache from '../git/publishedContentCache.js';
import { getProjectById } from '../projects.js';
import { putProjectJson } from '../utils/projectStorage.js';
import { sameContent } from '../utils/sameContent.js';
import { contentForbidden } from '../contentAccess.js';
import { projectDir } from '../utils/pathUtils.js';
import { pageKey } from '../utils/storageKeys.js';

/**
 * A page's public version, like an entry's: publishing commits the page and records that commit
 * (`publishedCommit`). Sites are served the page as committed then. Edits saved afterwards by
 * someone who needs a review stay in the page file, waiting, until the page is published again;
 * edits by someone who can publish go live as saved, as they always have.
 *
 * Where a page sits (its parent and order) is always the current one: moving a page in the tree
 * is not content. A project without Git keeps no published copy: it serves the file, so edits to
 * a live page can't wait there (they are refused, see `pinPublishedPage`).
 */

type ContentPage = StaticPage | CollectionPage;

const hasContent = (page: PageNode): page is ContentPage => page.type !== 'folder';

/** Whether the project can keep a page's published version (it has Git). */
export async function keepsVersions(projectId: string): Promise<boolean> {
    const project = await getProjectById(projectId);
    return !!project && project.git?.enabled !== false && isGitRepo(projectDir(projectId));
}

/**
 * The commit holding `page` exactly as given: the last one that touched its file, when that is
 * the same content, or else a new one made here.
 */
async function commitHolding(
    projectId: string,
    page: PageNode,
    user: User
): Promise<string | null> {
    const dir = projectDir(projectId);
    const key = pageKey(page.id);
    try {
        const last = getLog(dir, key, 1)[0]?.hash;
        if (last) {
            const raw = (await readBlobs(dir, [`${last}:${key}`])).get(`${last}:${key}`);
            if (raw != null && sameContent(JSON.parse(raw), page)) return last;
        }
        const message = `Publish page ${page.label || page.id} — ${user.name ?? user.id}`;
        return addAndCommit(dir, [key], message, user) || null;
    } catch {
        return null;
    }
}

/**
 * Make what the page holds now its public version. `save` records the save as usual (the
 * content hook commits it, pushes, runs deploy hooks); that commit becomes the published one,
 * and the pointer to it is saved in the page file, to be carried by its next commit. Returns
 * the page as saved. Without Git, the file is the public version.
 */
export async function publishPageVersion(
    projectId: string,
    user: User,
    page: PageNode,
    save: () => Promise<unknown> = async () => {}
): Promise<PageNode> {
    if (!hasContent(page)) return page;
    const { publishedCommit: _old, publishedAt: _at, ...content } = page;
    const live = { ...content, status: 'published' } as ContentPage;
    await putProjectJson(projectId, pageKey(page.id), live);
    await save();
    if (!(await keepsVersions(projectId))) return live;
    const commit = await commitHolding(projectId, live, user);
    if (!commit) return live;
    publishedCache.set(commit, pageKey(page.id), JSON.stringify(live));
    const saved = { ...live, publishedCommit: commit, publishedAt: new Date().toISOString() };
    await putProjectJson(projectId, pageKey(page.id), saved);
    return saved;
}

/**
 * Before changes wait on a live page (an edit by someone who needs a review, an import, a review
 * request): make sure its public version is pinned, so they never become it. A live page without
 * one (a copied project starts so) is pinned to its file as it is now. Without Git nothing can be
 * pinned, so the changes are refused.
 */
export async function pinPublishedPage(
    projectId: string,
    user: User,
    page: PageNode
): Promise<PageNode> {
    if (!hasContent(page) || page.status !== 'published' || page.publishedCommit) return page;
    if (!(await keepsVersions(projectId)))
        throw contentForbidden(
            'This project has no Git history, so a live page can’t keep its published version while changes wait. Ask someone who can publish.'
        );
    return publishPageVersion(projectId, user, page);
}

/** A page without its published pointer, for saving it as no longer live. */
export function withoutPublishedVersion<T extends PageNode>(page: T): T {
    if (!hasContent(page)) return page;
    const { publishedCommit: _c, publishedAt: _a, ...rest } = page;
    return rest as T;
}

/**
 * The public version of each page: drafts as they are (callers keep only published pages),
 * published pages as committed when they were published, in their current place in the tree.
 * A published page whose version can't be read is left out rather than shown as edited since.
 */
export async function publicPages(projectId: string, pages: PageNode[]): Promise<PageNode[]> {
    // In review, a live page keeps serving its published version.
    const pinned = pages.filter(
        (p): p is ContentPage =>
            hasContent(p) &&
            (p.status === 'published' || (p.status as string) === 'in_review') &&
            !!p.publishedCommit
    );
    if (pinned.length === 0) return pages;

    const versions = new Map<string, ContentPage>();
    const missing: string[] = [];
    for (const page of pinned) {
        const key = pageKey(page.id);
        const cached = publishedCache.get(page.publishedCommit!, key);
        if (cached !== undefined) {
            try {
                versions.set(page.id, JSON.parse(cached) as ContentPage);
                continue;
            } catch {
                /* read it from Git */
            }
        }
        missing.push(`${page.publishedCommit}:${key}`);
    }
    if (missing.length > 0) {
        const blobs = await readBlobs(projectDir(projectId), missing);
        for (const [spec, raw] of blobs) {
            if (raw == null) continue;
            try {
                const version = JSON.parse(raw) as ContentPage;
                versions.set(version.id, version);
                const sep = spec.indexOf(':');
                publishedCache.set(spec.slice(0, sep), spec.slice(sep + 1), raw);
            } catch {
                /* unreadable: left out below */
            }
        }
    }

    const out: PageNode[] = [];
    for (const page of pages) {
        if (!pinned.includes(page as ContentPage)) {
            out.push(page);
            continue;
        }
        const version = versions.get(page.id);
        if (!version) continue;
        out.push({
            ...version,
            parentId: page.parentId,
            order: page.order,
            status: 'published',
            publishedCommit: (page as ContentPage).publishedCommit,
            publishedAt: (page as ContentPage).publishedAt
        } as ContentPage);
    }
    return out;
}

/** One page's public version, or null when it has none (a draft, or a version that can't be read). */
export async function publicPage(projectId: string, page: PageNode): Promise<PageNode | null> {
    const [found] = await publicPages(projectId, [page]);
    if (!found) return null;
    return hasContent(found) && found.status !== 'published' ? null : found;
}

/** The pages as the members' API answers them: a live page with waiting edits says so. */
export async function withWaitingChanges<T extends PageNode>(
    projectId: string,
    pages: T[]
): Promise<T[]> {
    const pinned = pages.filter(
        p => hasContent(p) && p.status === 'published' && p.publishedCommit
    );
    if (pinned.length === 0) return pages;
    const versions = new Map((await publicPages(projectId, pinned)).map(p => [p.id, p]));
    return pages.map(page => {
        if (!pinned.includes(page)) return page;
        const version = versions.get(page.id);
        return {
            ...page,
            waitingChanges: !version || !sameContent(contentOf(version), contentOf(page))
        };
    });
}

/** Content only: where a page sits, its state and the pointer itself aren't changes. */
const contentOf = (p: PageNode) => {
    const { waitingChanges: _w, ...rest } = p as PageNode & { waitingChanges?: boolean };
    return {
        ...rest,
        parentId: null,
        order: 0,
        status: 'published',
        publishedCommit: '',
        publishedAt: ''
    };
};

/** Whether a live page has edits saved since it was published, waiting to go live. */
export async function hasWaitingChanges(projectId: string, page: PageNode): Promise<boolean> {
    if (!hasContent(page) || !page.publishedCommit) return false;
    const [version] = await publicPages(projectId, [page]);
    if (!version) return true;
    return !sameContent(contentOf(version), contentOf(page));
}
