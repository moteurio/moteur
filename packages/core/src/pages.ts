import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import type {
    PageNode,
    StaticPage,
    CollectionPage,
    FolderPage,
    PageStatus
} from '@moteurio/types/Page.js';
import { ValidationResult } from '@moteurio/types/ValidationResult.js';
import { isValidId } from './utils/idUtils.js';
import { approvalMessage, needsApproval } from '@moteurio/types';
import { User } from '@moteurio/types/User.js';
import {
    assertCanEdit,
    assertCanWrite,
    contentForbidden,
    translationOnlyChange,
    translatorOnly
} from './contentAccess.js';
import { getProject, getProjectById } from './projects.js';
import { assertUserCanAccessProject } from './utils/access.js';
import { getTemplate } from './templates.js';
import { getModelSchemaForProject } from './models.js';
import { hasApprovedReviewForPage } from './reviews.js';
import { getFileAtRevision } from './fileRevisions.js';
import { sameContent, type Restored } from './utils/sameContent.js';
import { triggerEvent } from './utils/eventBus.js';
import {
    getProjectJson,
    putProjectJson,
    hasProjectKey,
    listProjectKeys
} from './utils/projectStorage.js';
import { pageKey, pageListPrefix } from './utils/storageKeys.js';
import { assertCountRoom } from './planLimits.js';
import { pageFilePath, trashPagesDir } from './utils/pathUtils.js';
import { validatePage as validatePageAgainstTemplate } from './validators/validatePage.js';
import type { ProjectSchema } from '@moteurio/types/Project.js';

function projectLocalesList(project: ProjectSchema | null | undefined): string[] | undefined {
    if (!project) return undefined;
    const list = [project.defaultLocale, ...(project.supportedLocales ?? [])].filter(
        Boolean
    ) as string[];
    return list.length ? list : undefined;
}
import {
    buildNodeMap,
    buildChildMap,
    buildNavigationTree,
    resolveAllUrls as resolveAllUrlsFromTree,
    resolveBreadcrumb as resolveBreadcrumbFromTree,
    resolveNodePrefix,
    interpolatePattern,
    joinPath,
    slugIn,
    withLocale,
    type UrlLanguage,
    type UrlLanguages,
    type ResolvedUrl,
    type NavigationNode,
    type BreadcrumbItem
} from './pages/urlResolver.js';
import {
    getEntryForProject,
    getPublishedEntryForProject,
    listEntriesForProject,
    listPublishedEntriesForProject
} from './entries.js';
import { findRedirect, normalizePath, recordMovedAddresses } from './redirects.js';
import type { Redirect } from '@moteurio/types/Redirect.js';
import type { Entry, ModelSchema } from '@moteurio/types/Model.js';
import type { TemplateSchema } from '@moteurio/types/Template.js';
import { assertEntryComplete } from './validators/entryComplete.js';
import { dispatch as webhookDispatch } from './webhooks/webhookService.js';

export type { ResolvedUrl, NavigationNode, BreadcrumbItem };

export type ListPagesOptions = {
    type?: PageNode['type'];
    templateId?: string;
    parentId?: string | null;
    status?: PageStatus;
};

export type ReorderUpdate = {
    id: string;
    parentId: string | null;
    order: number;
};

function parsePageIds(listResult: string[]): string[] {
    return listResult
        .map(name => (name.endsWith('.json') ? name.slice(0, -5) : name))
        .filter(Boolean);
}

async function loadAllPages(projectId: string): Promise<PageNode[]> {
    const raw = await listProjectKeys(projectId, pageListPrefix());
    const ids = parsePageIds(raw);
    const pages: PageNode[] = [];
    for (const id of ids) {
        const page = await getProjectJson<PageNode>(projectId, pageKey(id));
        if (page) pages.push(page);
    }
    return pages;
}

export async function listPages(
    projectId: string,
    options?: ListPagesOptions
): Promise<PageNode[]> {
    if (!isValidId(projectId)) {
        throw new Error(`Invalid projectId: "${projectId}"`);
    }

    let pages = await loadAllPages(projectId);
    if (options?.type) {
        pages = pages.filter(p => p.type === options.type);
    }
    if (options?.templateId) {
        pages = pages.filter(
            p => (p as StaticPage | CollectionPage).templateId === options.templateId
        );
    }
    if (options?.parentId !== undefined) {
        const pid = options.parentId === '' ? null : options.parentId;
        pages = pages.filter(p => (p.parentId ?? null) === pid);
    }
    if (options?.status) {
        pages = pages.filter(p => (p as StaticPage | CollectionPage).status === options.status);
    }
    return pages;
}

export async function getPage(projectId: string, id: string): Promise<PageNode> {
    if (!id || !isValidId(id)) {
        throw new Error(`Invalid page ID: ${id}`);
    }

    const page = await getProjectJson<PageNode>(projectId, pageKey(id));
    if (!page) {
        throw new Error(`Page "${id}" not found in project "${projectId}".`);
    }
    return page;
}

export async function getPageWithAuth(
    user: User,
    projectId: string,
    id: string
): Promise<PageNode> {
    const project = await getProject(user, projectId);
    assertUserCanAccessProject(user, project);
    return getPage(projectId, id);
}

/**
 * The first page with this slug. With a locale, its slug in that language (a page without a
 * translated slug answers to its default one); without, its slug in any language.
 */
export async function getPageBySlug(
    projectId: string,
    slug: string,
    locale?: string
): Promise<PageNode | null> {
    const pages = await loadAllPages(projectId);
    if (locale) {
        const project = await getProjectById(projectId);
        const lang = { locale, defaultLocale: project?.defaultLocale ?? locale };
        return pages.find(p => slugIn(p, lang) === slug) ?? null;
    }
    const found =
        pages.find(p => p.slug === slug) ??
        pages.find(p => Object.values(p.slugs ?? {}).includes(slug));
    return found ?? null;
}

/** The project's languages, for addresses: default first. */
export function urlLanguagesFor(project: ProjectSchema | null | undefined): UrlLanguages {
    const defaultLocale = project?.defaultLocale || 'en';
    return {
        defaultLocale,
        locales: [defaultLocale, ...(project?.supportedLocales ?? [])].filter(Boolean),
        prefix: project?.localePrefix
    };
}

function languageList(languages: UrlLanguages): UrlLanguage[] {
    return [...new Set([languages.defaultLocale, ...languages.locales])].map(locale => ({
        locale,
        defaultLocale: languages.defaultLocale,
        prefix: languages.prefix
    }));
}

/**
 * Drafts may leave required fields empty; a page going live may not. Same error as entries
 * (ENTRY_INCOMPLETE, with the fields missing), so clients explain both the same way.
 */
function assertPageComplete(page: StaticPage | CollectionPage, template: TemplateSchema): void {
    assertEntryComplete(
        { id: page.label || page.id, data: page.fields ?? {} } as Entry,
        { id: template.id, label: template.label, fields: template.fields } as ModelSchema,
        'publish'
    );
}

function isUrlSafeSlug(slug: string, isRoot: boolean): boolean {
    if (isRoot && slug === '') return true;
    if (!/^[a-zA-Z0-9_-]+$/.test(slug)) return false;
    return true;
}

/** Translated slugs: only the project's other languages, each URL-safe and not empty. */
function assertTranslatedSlugs(slugs: unknown, project: ProjectSchema | null | undefined): void {
    if (slugs === undefined || slugs === null) return;
    if (typeof slugs !== 'object' || Array.isArray(slugs))
        throw new Error('slugs must be one slug per language, e.g. { "fr": "a-propos" }.');
    const languages = urlLanguagesFor(project);
    for (const [locale, slug] of Object.entries(slugs)) {
        if (locale === languages.defaultLocale)
            throw new Error(
                `"${locale}" is the default language: its slug is the page's slug, not in slugs.`
            );
        if (!languages.locales.includes(locale))
            throw new Error(`"${locale}" is not one of this project's languages.`);
        if (typeof slug !== 'string' || !isUrlSafeSlug(slug, false))
            throw new Error(
                `The ${locale} slug must be URL-safe (letters, digits, - and _), and not empty.`
            );
    }
}

/** Every slug a page answers to, by language (or all together when languages share addresses). */
function slugKeys(node: PageNode, languages: UrlLanguages): string[] {
    const list = languageList(languages);
    if ((languages.prefix ?? 'others') === 'none')
        return [...new Set(list.map(l => slugIn(node, l)))];
    return list.map(l => `${l.locale}:${slugIn(node, l)}`);
}

async function assertSlugUniqueAmongSiblings(
    projectId: string,
    page: Pick<PageNode, 'slug' | 'slugs' | 'parentId'>,
    excludePageId?: string
): Promise<void> {
    const parentId = page.parentId ?? null;
    const project = await getProjectById(projectId);
    const languages = urlLanguagesFor(project);
    const pages = await loadAllPages(projectId);
    const siblings = pages.filter(p => (p.parentId ?? null) === parentId && p.id !== excludePageId);
    const mine = slugKeys(page as PageNode, languages);
    for (const sibling of siblings) {
        const theirs = new Set(slugKeys(sibling, languages));
        const taken = mine.find(k => theirs.has(k));
        if (taken === undefined) continue;
        const slug = taken.includes(':') ? taken.slice(taken.indexOf(':') + 1) : taken;
        // The home page's empty slug is the root itself.
        if (slug === '' && parentId === null) continue;
        throw new Error(`Another page already uses the slug "${slug}" under the same parent.`);
    }
}

async function assertNoParentCycle(
    projectId: string,
    pageId: string,
    parentId: string
): Promise<void> {
    if (parentId === pageId) {
        throw new Error('A page cannot be its own parent.');
    }
    let currentId: string | undefined = parentId;
    const seen = new Set<string>([pageId]);
    while (currentId) {
        if (seen.has(currentId)) {
            throw new Error('Parent would create a circular reference.');
        }
        seen.add(currentId);
        const parentPage: PageNode | null = await getProjectJson<PageNode>(
            projectId,
            pageKey(currentId)
        );
        currentId = parentPage?.parentId ?? undefined;
    }
}

function getNextOrder(pages: PageNode[], parentId: string | null): number {
    const siblings = pages.filter(p => (p.parentId ?? null) === parentId);
    if (siblings.length === 0) return 0;
    return Math.max(...siblings.map(p => p.order), -1) + 1;
}

function ensurePageNodeDefaults(
    data: Partial<PageNode> & { type: PageNode['type']; label: string; slug: string },
    projectId: string,
    id: string,
    order: number,
    now: string
): PageNode {
    const base = {
        id,
        projectId,
        label: data.label,
        slug: data.slug,
        ...(data.slugs && Object.keys(data.slugs).length > 0 && { slugs: data.slugs }),
        parentId: data.parentId ?? null,
        order,
        navInclude: data.navInclude ?? true,
        navLabel: data.navLabel,
        sitemapInclude: data.sitemapInclude ?? true,
        sitemapPriority: data.sitemapPriority ?? 0.5,
        sitemapChangefreq: data.sitemapChangefreq,
        createdAt: now,
        updatedAt: now
    };
    if (data.type === 'folder') {
        return { ...base, type: 'folder' } as FolderPage;
    }
    if (data.type === 'static') {
        return {
            ...base,
            type: 'static',
            templateId: (data as Partial<StaticPage>).templateId!,
            status: ((data as Partial<StaticPage>).status ?? 'draft') as PageStatus,
            fields: (data as Partial<StaticPage>).fields ?? {}
        } as StaticPage;
    }
    if (data.type === 'collection') {
        const c = data as Partial<CollectionPage>;
        return {
            ...base,
            type: 'collection',
            templateId: c.templateId!,
            status: (c.status ?? 'draft') as PageStatus,
            fields: c.fields ?? {},
            modelId: c.modelId!,
            urlPattern: c.urlPattern,
            entryStatus: c.entryStatus ?? 'published',
            sitemapIncludeEntries: c.sitemapIncludeEntries ?? true
        } as CollectionPage;
    }
    throw new Error(`Unknown page type: ${(data as any).type}`);
}

export async function createPage(
    projectId: string,
    user: User,
    data: Partial<PageNode> & { type: PageNode['type']; label: string; slug: string }
): Promise<PageNode> {
    const project = await getProject(user, projectId);
    assertUserCanAccessProject(user, project);
    assertCanWrite(user);
    // A new page has no review yet: someone who needs one creates it as a draft.
    if ((data as StaticPage).status === 'published' && needsApproval(user, project))
        throw contentForbidden(approvalMessage(user, project));

    const id = randomUUID();
    const parentId = data.parentId ?? null;
    const isRoot = parentId === null;

    if (!isUrlSafeSlug(data.slug, isRoot)) {
        throw new Error(
            'Slug must be URL-safe (no spaces or slashes). Empty slug allowed only for root.'
        );
    }

    assertTranslatedSlugs(data.slugs, project);

    const allPages = await loadAllPages(projectId);
    assertCountRoom(projectId, 'pages', allPages.length);
    await assertSlugUniqueAmongSiblings(projectId, { ...data, parentId });

    if (parentId) {
        await getPage(projectId, parentId);
        await assertNoParentCycle(projectId, id, parentId);
    }

    const order = getNextOrder(allPages, parentId);
    const now = new Date().toISOString();
    const page = ensurePageNodeDefaults(data, projectId, id, order, now);

    if (page.type === 'static' || page.type === 'collection') {
        const templateId = (page as StaticPage | CollectionPage).templateId;
        const validation = await validatePageAgainstTemplate(
            projectId,
            { id: page.id, fields: (page as StaticPage).fields },
            await getTemplate(projectId, templateId),
            {
                projectLocales: projectLocalesList(project),
                allowHtmlIframe: project.allowHtmlIframe === true,
                allowHtmlEmbed: project.allowHtmlEmbed === true,
                // Required fields are checked apart, by status (assertPageComplete).
                draft: true
            }
        );
        if (!validation.valid) {
            const msg = validation.issues.map(i => `${i.path}: ${i.message}`).join('; ');
            throw new Error(`Page validation failed: ${msg}`);
        }
        if ((page as StaticPage).status === 'published')
            assertPageComplete(page as StaticPage, await getTemplate(projectId, templateId));
    }
    if (data.type === 'collection') {
        const modelId = (data as CollectionPage).modelId;
        if (!modelId) throw new Error('modelId is required for collection pages.');
        const model = await getModelSchemaForProject(projectId, modelId);
        if (!model) throw new Error(`Model "${modelId}" not found.`);
    }

    if (await hasProjectKey(projectId, pageKey(id))) {
        throw new Error(`Page "${id}" already exists in project "${projectId}".`);
    }

    await triggerEvent('page.beforeCreate', { page, user, projectId });
    await putProjectJson(projectId, pageKey(id), page);
    triggerEvent('content.saved', {
        projectId,
        paths: [pageKey(id)],
        message: `Create page ${id} — ${user.name ?? user.id}`,
        user
    });
    triggerEvent('page.afterCreate', { page, user, projectId });
    return page;
}

export async function updatePage(
    projectId: string,
    user: User,
    id: string,
    patch: Partial<PageNode>,
    options?: { restoredFrom?: string }
): Promise<PageNode> {
    if ((patch as any).status === 'published') {
        const project = await getProject(user, projectId);
        if (needsApproval(user, project)) {
            const approved = await hasApprovedReviewForPage(projectId, id);
            if (!approved) throw contentForbidden(approvalMessage(user, project));
        }
    }

    const current = await getPageWithAuth(user, projectId, id);
    assertCanEdit(user);
    if (translatorOnly(user)) {
        const project = await getProject(user, projectId);
        const locales = [project.defaultLocale, ...(project.supportedLocales ?? [])].filter(
            Boolean
        );
        const extra = Object.keys(patch).filter(
            key => key !== 'fields' && key !== 'slugs' && key !== 'updatedAt'
        );
        const beforeFields = (current as { fields?: unknown }).fields ?? {};
        const afterFields =
            (patch as { fields?: unknown }).fields === undefined
                ? beforeFields
                : { ...(beforeFields as object), ...((patch as { fields?: object }).fields ?? {}) };
        if (
            extra.length > 0 ||
            !translationOnlyChange(beforeFields, afterFields, locales, project.defaultLocale)
        ) {
            throw contentForbidden('A translator can only change other languages.');
        }
    }
    const updated = { ...current, ...patch } as PageNode;

    if (updated.type === 'static' || updated.type === 'collection') {
        const templateId = (updated as StaticPage | CollectionPage).templateId;
        if (templateId) {
            const template = await getTemplate(projectId, templateId);
            const proj = await getProjectById(projectId);
            const validation = await validatePageAgainstTemplate(
                projectId,
                { ...updated, templateId, fields: (updated as StaticPage).fields } as any,
                template,
                {
                    projectLocales: projectLocalesList(proj),
                    allowHtmlIframe: proj?.allowHtmlIframe === true,
                    allowHtmlEmbed: proj?.allowHtmlEmbed === true,
                    // Required fields are checked apart, by status (assertPageComplete).
                    draft: true
                }
            );
            if (!validation.valid) {
                const msg = validation.issues.map(i => `${i.path}: ${i.message}`).join('; ');
                throw new Error(`Page validation failed: ${msg}`);
            }
            if ((updated as StaticPage).status === 'published')
                assertPageComplete(updated as StaticPage, template);
        }
    }

    if (patch.slug !== undefined && patch.slug !== current.slug) {
        const isRoot = (updated.parentId ?? null) === null;
        if (!isUrlSafeSlug(updated.slug, isRoot)) {
            throw new Error('Slug must be URL-safe (no spaces or slashes).');
        }
    }
    if (patch.slugs !== undefined) {
        assertTranslatedSlugs(patch.slugs, await getProjectById(projectId));
        // An empty map (or null) clears the translated slugs.
        if (!updated.slugs || Object.keys(updated.slugs).length === 0) delete updated.slugs;
    }
    const addressChanged = movesAddress(current, updated);
    if (addressChanged) await assertSlugUniqueAmongSiblings(projectId, updated, id);
    const newParentId = patch.parentId !== undefined ? patch.parentId : updated.parentId;
    if (newParentId && newParentId !== current.parentId) {
        await getPage(projectId, newParentId);
        await assertNoParentCycle(projectId, id, newParentId);
    }

    if ((patch as Partial<CollectionPage>).modelId !== undefined && updated.type === 'collection') {
        const model = await getModelSchemaForProject(
            projectId,
            (updated as CollectionPage).modelId
        );
        if (!model) throw new Error(`Model "${(updated as CollectionPage).modelId}" not found.`);
    }

    // Nothing to save: no commit, no hooks, no webhooks.
    if (sameContent(current, updated)) return current;

    await triggerEvent('page.beforeUpdate', { page: updated, user, projectId });
    const before = addressChanged ? await liveAddresses(projectId) : undefined;
    await putProjectJson(projectId, pageKey(id), updated);
    triggerEvent('content.saved', {
        projectId,
        paths: [pageKey(id)],
        message: options?.restoredFrom
            ? `Restore page ${id} from ${options.restoredFrom.slice(0, 7)} — ${user.name ?? user.id}`
            : `Update page ${id} — ${user.name ?? user.id}`,
        user
    });
    triggerEvent('page.afterUpdate', { page: updated, user, projectId });
    if (before) await redirectMoved(projectId, user, before);

    const pagePayload = (): { pageId: string; title: string; url: string; updatedBy: string } => ({
        pageId: id,
        title: updated.label,
        url: updated.slug ? `/${updated.slug}` : '/',
        updatedBy: user.id
    });
    try {
        const currentStatus = (current as StaticPage | CollectionPage).status ?? 'draft';
        const newStatus = (updated as StaticPage | CollectionPage).status ?? 'draft';
        if (current.type === 'static' || current.type === 'collection') {
            if (currentStatus !== 'published' && newStatus === 'published') {
                await webhookDispatch('page.published', pagePayload(), {
                    projectId,
                    source: 'api'
                });
            } else if (currentStatus === 'published' && newStatus === 'draft') {
                await webhookDispatch('page.unpublished', pagePayload(), {
                    projectId,
                    source: 'api'
                });
            } else if (currentStatus === 'published' && newStatus === 'published') {
                // Pages are live as saved: the site changed.
                await webhookDispatch('page.updated', pagePayload(), { projectId, source: 'api' });
            }
        } else if (addressChanged) {
            // A folder that moves moves the pages in it.
            await webhookDispatch('page.updated', pagePayload(), { projectId, source: 'api' });
        }
    } catch {
        // never fail the operation
    }
    return updated;
}

/** What a page restore leaves as it is: where the page lives in the site, and its state. */
const KEPT_ON_RESTORE = [
    'id',
    'projectId',
    'type',
    'parentId',
    'order',
    'slug',
    'slugs',
    'status',
    'createdAt'
] as const;

/**
 * Put a page back as it was saved in one revision, as a new save on top of the history (every
 * later version stays and can be restored in turn). Its content, template and settings go back;
 * its place in the tree, address and status stay. Pages are live as saved, so a published page
 * shows the restored content at once.
 */
export async function restorePageAtRevision(
    projectId: string,
    user: User,
    id: string,
    revisionId: string
): Promise<Restored<PageNode>> {
    const current = await getPageWithAuth(user, projectId, id);
    const snapshot = getFileAtRevision(projectId, pageKey(id), revisionId) as PageNode | null;
    if (!snapshot) throw new Error('Revision not found');
    if (snapshot.type !== current.type) {
        throw new Error(
            `Page validation failed: this version is a ${snapshot.type} page; it is a ${current.type} page now.`
        );
    }
    const cleared = Object.fromEntries(Object.keys(current).map(k => [k, undefined]));
    const kept = Object.fromEntries(
        KEPT_ON_RESTORE.map(k => [k, (current as unknown as Record<string, unknown>)[k]])
    );
    const restored = await updatePage(
        projectId,
        user,
        id,
        {
            ...cleared,
            ...snapshot,
            ...kept,
            updatedAt: new Date().toISOString()
        } as Partial<PageNode>,
        { restoredFrom: revisionId }
    );
    // Already the same as that version: nothing was saved.
    return { restored, changed: !sameContent(current, restored) };
}

export async function deletePage(projectId: string, user: User, id: string): Promise<void> {
    assertCanWrite(user);
    const current = await getPageWithAuth(user, projectId, id);
    const allPages = await loadAllPages(projectId);
    const children = allPages.filter(p => (p.parentId ?? null) === id);
    if (children.length > 0) {
        const err = new Error(
            'Cannot delete a page that has children. Move or delete the children first.'
        ) as Error & { statusCode?: number };
        err.statusCode = 409;
        throw err;
    }

    await triggerEvent('page.beforeDelete', { page: current, user, projectId });

    const source = pageFilePath(projectId, id);
    const destDir = trashPagesDir(projectId);
    const dest = path.join(destDir, `${id}.json`);

    try {
        fs.mkdirSync(destDir, { recursive: true });
        fs.renameSync(source, dest);
    } catch (err) {
        if ((err as { code?: string }).code !== 'ENOENT') throw err;
    }

    triggerEvent('content.deleted', {
        projectId,
        paths: [pageKey(id)],
        message: `Delete page ${id} — ${user.name ?? user.id}`,
        user
    });
    triggerEvent('page.afterDelete', { page: current, user, projectId });

    try {
        const slug = current.slug ? `/${current.slug}` : '/';
        await webhookDispatch(
            'page.deleted',
            {
                pageId: current.id,
                title: current.label,
                url: slug,
                updatedBy: user.id
            },
            { projectId, source: 'api' }
        );
    } catch {
        // never fail the operation
    }
}

export async function reorderPages(
    projectId: string,
    user: User,
    updates: ReorderUpdate[]
): Promise<PageNode[]> {
    const project = await getProject(user, projectId);
    assertUserCanAccessProject(user, project);

    const allPages = await loadAllPages(projectId);
    const nodeMap = new Map(allPages.map(p => [p.id, p]));

    for (const u of updates) {
        const node = nodeMap.get(u.id);
        if (!node) throw new Error(`Page "${u.id}" not found.`);
        if (u.parentId) {
            const parent = nodeMap.get(u.parentId);
            if (!parent) throw new Error(`Parent "${u.parentId}" not found.`);
            let cur: string | undefined = u.parentId;
            const seen = new Set<string>([u.id]);
            while (cur) {
                if (seen.has(cur)) {
                    throw new Error('Reorder would create a cycle.');
                }
                seen.add(cur);
                const p = nodeMap.get(cur);
                cur = p?.parentId ?? undefined;
            }
        }
    }

    const updatedNodes = allPages.map(p => {
        const u = updates.find(x => x.id === p.id);
        if (!u) return p;
        return { ...p, parentId: u.parentId ?? null, order: u.order };
    });

    // The tree after every move must have no loop (two moves can make one together).
    const after = new Map(updatedNodes.map(n => [n.id, n]));
    for (const node of updatedNodes) {
        const seen = new Set<string>();
        let cur: string | null = node.id;
        while (cur) {
            if (seen.has(cur)) throw new Error('Reorder would create a cycle.');
            seen.add(cur);
            cur = after.get(cur)?.parentId ?? null;
        }
    }

    // A page moved under a new parent must not take a sibling's address, in any language.
    const languages = urlLanguagesFor(await getProjectById(projectId));
    const seenSlugs = new Map<string, string>();
    for (const node of updatedNodes) {
        for (const slugKey of new Set(slugKeys(node, languages))) {
            const slug = slugKey.slice(slugKey.indexOf(':') + 1);
            if (slug === '' && (node.parentId ?? null) === null) continue;
            const key = `${node.parentId ?? ''}/${slugKey}`;
            const other = seenSlugs.get(key);
            if (other)
                throw new Error(
                    `"${node.label}" and "${other}" would both be at the same address ("${slug}") under one parent.`
                );
            seenSlugs.set(key, node.label);
        }
    }

    // Only pages that moved are written (and committed).
    const moved = updatedNodes.some(n => movesAddress(nodeMap.get(n.id)!, n));
    const before = moved ? await liveAddresses(projectId) : undefined;
    const paths: string[] = [];
    for (const node of updatedNodes) {
        const before = nodeMap.get(node.id)!;
        if ((before.parentId ?? null) === (node.parentId ?? null) && before.order === node.order)
            continue;
        const key = pageKey(node.id);
        await putProjectJson(projectId, key, { ...node, updatedAt: new Date().toISOString() });
        paths.push(key);
    }
    if (paths.length > 0) {
        triggerEvent('content.saved', {
            projectId,
            paths,
            message: `Reorder pages — ${user.name ?? user.id}`,
            user
        });
    }
    if (before) await redirectMoved(projectId, user, before);
    // The navigation follows the tree: a moved live page (or folder) changes the site.
    for (const node of updatedNodes) {
        const was = nodeMap.get(node.id)!;
        const moved =
            (was.parentId ?? null) !== (node.parentId ?? null) || was.order !== node.order;
        const live = node.type === 'folder' || (node as StaticPage).status === 'published';
        if (!moved || !live) continue;
        try {
            await webhookDispatch(
                'page.updated',
                {
                    pageId: node.id,
                    title: node.label,
                    url: node.slug ? `/${node.slug}` : '/',
                    updatedBy: user.id
                },
                { projectId, source: 'api' }
            );
        } catch {
            // never fail the operation
        }
    }
    return updatedNodes;
}

async function getEntriesForResolver(
    projectId: string,
    modelId: string,
    status?: PageStatus
): Promise<Entry[]> {
    const statusFilter = status ?? 'published';
    if (statusFilter === 'published') {
        return listPublishedEntriesForProject(projectId, modelId, { status: 'published' });
    }
    return listEntriesForProject(projectId, modelId, { status: statusFilter });
}

export async function resolveAllUrls(projectId: string): Promise<ResolvedUrl[]> {
    const nodes = await loadAllPages(projectId);
    const project = await getProjectById(projectId);
    return resolveAllUrlsFromTree(
        nodes,
        getEntriesForResolver,
        projectId,
        urlLanguagesFor(project)
    );
}

/** A language of the project, for one address; an unknown or missing locale is the default. */
async function urlLanguage(projectId: string, locale?: string): Promise<UrlLanguage> {
    const languages = urlLanguagesFor(await getProjectById(projectId));
    return {
        locale: locale && languages.locales.includes(locale) ? locale : languages.defaultLocale,
        defaultLocale: languages.defaultLocale,
        prefix: languages.prefix
    };
}

export async function getNavigation(
    projectId: string,
    options?: { depth?: number; rootId?: string | null; locale?: string }
): Promise<NavigationNode[]> {
    const nodes = await loadAllPages(projectId);
    const nodeMap = buildNodeMap(nodes);
    const childMap = buildChildMap(nodes);
    const lang = await urlLanguage(projectId, options?.locale);
    return buildNavigationTree(nodes, nodeMap, childMap, { ...options, lang });
}

export async function resolveBreadcrumb(
    projectId: string,
    nodeId: string,
    entryId?: string,
    locale?: string
): Promise<{ url: string; breadcrumb: BreadcrumbItem[] }> {
    const nodes = await loadAllPages(projectId);
    const nodeMap = buildNodeMap(nodes);
    let entry: Entry | undefined;
    if (entryId) {
        const node = nodeMap.get(nodeId);
        if (node?.type === 'collection') {
            const modelId = (node as CollectionPage).modelId;
            entry =
                (
                    await listPublishedEntriesForProject(projectId, modelId, {
                        status: 'published'
                    })
                ).find(e => e.id === entryId) ?? undefined;
        }
    }
    return resolveBreadcrumbFromTree(nodeId, nodeMap, entry, await urlLanguage(projectId, locale));
}

/**
 * An entry's live address in every language, by locale, from the collection page showing its
 * model. Empty when no page shows the model, the entry isn't public, or the pattern gives nothing.
 */
export async function resolveEntryUrls(
    projectId: string,
    entryId: string,
    modelId: string
): Promise<Record<string, string>> {
    const nodes = await loadAllPages(projectId);
    const nodeMap = buildNodeMap(nodes);
    const collectionPage = nodes.find(
        (n): n is CollectionPage => n.type === 'collection' && n.modelId === modelId
    );
    if (!collectionPage?.urlPattern) return {};

    const entryStatus = collectionPage.entryStatus ?? 'published';
    const entry =
        entryStatus === 'published'
            ? await getPublishedEntryForProject(projectId, modelId, entryId)
            : await getEntryForProject(projectId, modelId, entryId);
    if (!entry || (entry.status ?? 'draft') !== entryStatus) return {};

    const languages = urlLanguagesFor(await getProjectById(projectId));
    const urls: Record<string, string> = {};
    for (const lang of languageList(languages)) {
        const segment = interpolatePattern(collectionPage.urlPattern, entry, lang);
        if (!segment) continue;
        const prefix = resolveNodePrefix(collectionPage.id, nodeMap, { ...lang, prefix: 'none' });
        urls[lang.locale] = withLocale(joinPath(prefix, segment), lang);
    }
    return urls;
}

/** An entry's live address in one language (the default when none is given). */
export async function resolveEntryUrl(
    projectId: string,
    entryId: string,
    modelId: string,
    locale?: string
): Promise<string | null> {
    const urls = await resolveEntryUrls(projectId, entryId, modelId);
    const lang = await urlLanguage(projectId, locale);
    return urls[lang.locale] ?? null;
}

export type ResolvedPath =
    | ({ match: 'page' } & ResolvedUrl)
    | { match: 'redirect'; from: string; to: string; status: Redirect['status'] };

/**
 * What lives at a path on the site: a page or entry (with its language and its address in the
 * others), or a redirect to follow. A live page wins over a redirect from its address.
 */
export async function resolvePath(
    projectId: string,
    rawPath: string
): Promise<ResolvedPath | null> {
    const path = normalizePath(rawPath);
    if (path === null) return null;
    const urls = await resolveAllUrls(projectId);
    const found = urls.find(u => u.url === path);
    if (found) return { match: 'page', ...found };
    const redirect = await findRedirect(projectId, path);
    return redirect
        ? { match: 'redirect', from: redirect.from, to: redirect.to, status: redirect.status }
        : null;
}

/** The address of everything live, keyed by page, entry and language. */
async function liveAddresses(projectId: string): Promise<Map<string, string>> {
    const urls = await resolveAllUrls(projectId);
    return new Map(urls.map(u => [`${u.nodeId}|${u.entryId ?? ''}|${u.locale ?? ''}`, u.url]));
}

/** After a save, a redirect from each live address that changed to where it went. */
async function redirectMoved(
    projectId: string,
    user: User,
    before: Map<string, string>
): Promise<void> {
    try {
        const after = await liveAddresses(projectId);
        const moves: { from: string; to: string }[] = [];
        for (const [key, from] of before) {
            const to = after.get(key);
            if (to && to !== from) moves.push({ from, to });
        }
        if (moves.length) await recordMovedAddresses(projectId, user, moves);
    } catch (err) {
        // A failed redirect never fails the save.
        console.error('[Moteur] Could not record moved addresses:', err);
    }
}

/** True when a save changes where a page lives: its slugs or its parent. */
function movesAddress(before: PageNode, after: PageNode): boolean {
    return (
        before.slug !== after.slug ||
        (before.parentId ?? null) !== (after.parentId ?? null) ||
        !sameContent(before.slugs ?? {}, after.slugs ?? {})
    );
}

export async function validatePageById(projectId: string, id: string): Promise<ValidationResult> {
    const page = await getPage(projectId, id);
    if (page.type === 'folder') {
        return { valid: true, issues: [] };
    }
    const template = await getTemplate(projectId, (page as StaticPage | CollectionPage).templateId);
    const proj = await getProjectById(projectId);
    return await validatePageAgainstTemplate(
        projectId,
        {
            ...page,
            templateId: (page as StaticPage).templateId,
            fields: (page as StaticPage).fields
        } as any,
        template,
        {
            projectLocales: projectLocalesList(proj),
            allowHtmlIframe: proj?.allowHtmlIframe === true,
            allowHtmlEmbed: proj?.allowHtmlEmbed === true
        }
    );
}

export async function validateAllPages(projectId: string): Promise<ValidationResult[]> {
    const pages = await loadAllPages(projectId);
    const results: ValidationResult[] = [];
    for (const page of pages) {
        try {
            if (page.type === 'folder') {
                results.push({ valid: true, issues: [] });
                continue;
            }
            const template = await getTemplate(
                projectId,
                (page as StaticPage | CollectionPage).templateId
            );
            const proj = await getProjectById(projectId);
            results.push(
                await validatePageAgainstTemplate(
                    projectId,
                    {
                        ...page,
                        templateId: (page as StaticPage).templateId,
                        fields: (page as StaticPage).fields
                    } as any,
                    template,
                    {
                        projectLocales: projectLocalesList(proj),
                        allowHtmlIframe: proj?.allowHtmlIframe === true,
                        allowHtmlEmbed: proj?.allowHtmlEmbed === true
                    }
                )
            );
        } catch {
            results.push({
                valid: false,
                issues: [
                    {
                        type: 'error',
                        code: 'PAGE_INVALID_TEMPLATE',
                        message: `Template "${(page as StaticPage).templateId}" not found.`,
                        path: 'templateId'
                    }
                ]
            });
        }
    }
    return results;
}
