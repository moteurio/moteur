import type { CollectionPage, PageNode, StaticPage } from '@moteurio/types/Page.js';
import type { User } from '@moteurio/types/User.js';
import { addAndCommit, getLog, gitSettled, isGitRepo, readBlobs } from '../git/gitService.js';
import * as publishedCache from '../git/publishedContentCache.js';
import { getProjectById } from '../projects.js';
import { putProjectJson } from '../utils/projectStorage.js';
import { sameContent } from '../utils/sameContent.js';
import { contentForbidden } from '../contentAccess.js';
import { projectDir } from '../utils/pathUtils.js';
import { pageKey } from '../utils/storageKeys.js';

/**
 * Tracks the public version of a page, the same way it is done for entries. Publishing commits the
 * page and records that commit as `publishedCommit`. Sites are served the page as it was in that
 * commit. Edits saved afterwards by a user who needs review stay in the page file as waiting
 * changes until the page is published again. Edits by a user who can publish go live as soon as
 * they are saved.
 *
 * A page's position in the tree (its parent and order) always comes from the current page file,
 * because moving a page is not a content change. A project without Git keeps no published copy and
 * serves the page file itself, so edits to a live page cannot wait there and are refused (see
 * `pinPublishedPage`).
 */

type ContentPage = StaticPage | CollectionPage;

const hasContent = (page: PageNode): page is ContentPage => page.type !== 'folder';

/** Whether the project can keep published versions of pages, which requires Git. */
export async function keepsVersions(projectId: string): Promise<boolean> {
    const project = await getProjectById(projectId);
    return !!project && project.git?.enabled !== false && isGitRepo(projectDir(projectId));
}

/**
 * Returns a commit that contains `page` exactly as given. This is the last commit that touched the
 * page file if its content is identical, otherwise a new commit made here.
 */
async function commitHolding(
    projectId: string,
    page: PageNode,
    user: User
): Promise<string | null> {
    const dir = projectDir(projectId);
    const key = pageKey(page.id);
    try {
        const last = (await getLog(dir, key, 1))[0]?.hash;
        if (last) {
            const raw = (await readBlobs(dir, [`${last}:${key}`])).get(`${last}:${key}`);
            if (raw != null && sameContent(JSON.parse(raw), page)) return last;
        }
        const message = `Publish page ${page.label || page.id} — ${user.name ?? user.id}`;
        return (await addAndCommit(dir, [key], message, user)) || null;
    } catch {
        return null;
    }
}

/**
 * Makes the page's current content its public version. `save` records the save as usual (the
 * content hook commits it, pushes and runs deploy hooks). That commit becomes the published
 * version, and the reference to it is stored in the page file, to be included in its next commit.
 * Returns the saved page. Without Git, the page file itself is the public version.
 */
export async function publishPageVersion(
    projectId: string,
    user: User,
    page: PageNode,
    save: () => Promise<unknown> = async () => {}
): Promise<PageNode> {
    if (!hasContent(page)) return page;
    // Wait for earlier saves to commit first. Otherwise their background commits would include this version.
    await gitSettled(projectDir(projectId));
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
 * Ensures a live page has a pinned public version before changes are allowed to wait on it (an edit
 * by a user who needs review, an import, or a review request). Without a pinned version, waiting
 * changes would become the public version. A live page that has none, as in a copied project, is
 * pinned to its current file. Without Git nothing can be pinned, so the changes are refused.
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

/** Returns the page without its published-version fields, for saving it as no longer live. */
export function withoutPublishedVersion<T extends PageNode>(page: T): T {
    if (!hasContent(page)) return page;
    const { publishedCommit: _c, publishedAt: _a, ...rest } = page;
    return rest as T;
}

/**
 * Returns the public version of each page. Drafts are returned unchanged, and callers keep only
 * published pages. Published pages are returned as they were committed when published, but with
 * their current position in the tree. A published page whose version cannot be read is left out
 * instead of being shown with later edits.
 */
export async function publicPages(projectId: string, pages: PageNode[]): Promise<PageNode[]> {
    // A live page that is in review keeps serving its published version.
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
                /* The cached text is not valid JSON, so read it from Git. */
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
                /* Unreadable, so the page is left out below. */
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

/** Returns one page's public version, or null if it has none (a draft, or a version that cannot be read). */
export async function publicPage(projectId: string, page: PageNode): Promise<PageNode | null> {
    const [found] = await publicPages(projectId, [page]);
    if (!found) return null;
    return hasContent(found) && found.status !== 'published' ? null : found;
}

/** Adds `waitingChanges` to live pages, which is true when a page has edits that are not yet published. */
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

/** Strips the fields that are not content, so comparing two pages ignores position, status and published-version references. */
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

/** Whether a live page has edits saved since it was published that are not yet live. */
export async function hasWaitingChanges(projectId: string, page: PageNode): Promise<boolean> {
    if (!hasContent(page) || !page.publishedCommit) return false;
    const [version] = await publicPages(projectId, [page]);
    if (!version) return true;
    return !sameContent(contentOf(version), contentOf(page));
}
