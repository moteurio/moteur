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
import { User } from '@moteurio/types/User.js';
import { getProject, getProjectById } from './projects.js';
import { assertUserCanAccessProject } from './utils/access.js';
import { getTemplate } from './templates.js';
import { getModelSchemaForProject } from './models.js';
import { hasApprovedReviewForPage } from './reviews.js';
import { triggerEvent } from './utils/eventBus.js';
import {
    getProjectJson,
    putProjectJson,
    hasProjectKey,
    listProjectKeys
} from './utils/projectStorage.js';
import { pageKey, pageListPrefix } from './utils/storageKeys.js';
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
    type ResolvedUrl,
    type NavigationNode,
    type BreadcrumbItem
} from './pages/urlResolver.js';
import { listEntriesForProject, listPublishedEntriesForProject } from './entries.js';
import type { Entry } from '@moteurio/types/Model.js';
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

export async function getPageBySlug(projectId: string, slug: string): Promise<PageNode | null> {
    const pages = await loadAllPages(projectId);
    const found = pages.find(p => p.slug === slug);
    return found ?? null;
}

function isUrlSafeSlug(slug: string, isRoot: boolean): boolean {
    if (isRoot && slug === '') return true;
    if (!/^[a-zA-Z0-9_-]+$/.test(slug)) return false;
    return true;
}

async function assertSlugUniqueAmongSiblings(
    projectId: string,
    parentId: string | null,
    slug: string,
    excludePageId?: string
): Promise<void> {
    if (slug === '' && parentId === null) return;
    const pages = await loadAllPages(projectId);
    const siblings = pages.filter(p => (p.parentId ?? null) === parentId);
    const existing = siblings.find(p => p.slug === slug && p.id !== excludePageId);
    if (existing) {
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

    const id = randomUUID();
    const parentId = data.parentId ?? null;
    const isRoot = parentId === null;

    if (!isUrlSafeSlug(data.slug, isRoot)) {
        throw new Error(
            'Slug must be URL-safe (no spaces or slashes). Empty slug allowed only for root.'
        );
    }

    const allPages = await loadAllPages(projectId);
    await assertSlugUniqueAmongSiblings(projectId, parentId, data.slug);

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
                allowHtmlEmbed: project.allowHtmlEmbed === true
            }
        );
        if (!validation.valid) {
            const msg = validation.issues.map(i => `${i.path}: ${i.message}`).join('; ');
            throw new Error(`Page validation failed: ${msg}`);
        }
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

    triggerEvent('page.beforeCreate', { page, user, projectId });
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
    patch: Partial<PageNode>
): Promise<PageNode> {
    if ((patch as any).status === 'published') {
        const project = await getProject(user, projectId);
        if (project.workflow?.enabled && project.workflow?.requireReview) {
            const isAdmin = Array.isArray(user.roles) && user.roles.includes('admin');
            if (!isAdmin) {
                const approved = await hasApprovedReviewForPage(projectId, id);
                if (!approved) {
                    throw new Error(
                        'Publishing requires an approved review when the project has review workflow enabled.'
                    );
                }
            }
        }
    }

    const current = await getPageWithAuth(user, projectId, id);
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
                    allowHtmlEmbed: proj?.allowHtmlEmbed === true
                }
            );
            if (!validation.valid) {
                const msg = validation.issues.map(i => `${i.path}: ${i.message}`).join('; ');
                throw new Error(`Page validation failed: ${msg}`);
            }
        }
    }

    if (patch.slug !== undefined && patch.slug !== current.slug) {
        const isRoot = (updated.parentId ?? null) === null;
        if (!isUrlSafeSlug(updated.slug, isRoot)) {
            throw new Error('Slug must be URL-safe (no spaces or slashes).');
        }
        await assertSlugUniqueAmongSiblings(projectId, updated.parentId ?? null, updated.slug, id);
    }
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

    triggerEvent('page.beforeUpdate', { page: updated, user, projectId });
    await putProjectJson(projectId, pageKey(id), updated);
    triggerEvent('content.saved', {
        projectId,
        paths: [pageKey(id)],
        message: `Update page ${id} — ${user.name ?? user.id}`,
        user
    });
    triggerEvent('page.afterUpdate', { page: updated, user, projectId });

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
                webhookDispatch('page.published', pagePayload(), { projectId, source: 'api' });
            } else if (currentStatus === 'published' && newStatus === 'draft') {
                webhookDispatch('page.unpublished', pagePayload(), { projectId, source: 'api' });
            }
        }
    } catch {
        // never fail the operation
    }
    return updated;
}

export async function deletePage(projectId: string, user: User, id: string): Promise<void> {
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

    triggerEvent('page.beforeDelete', { page: current, user, projectId });

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
        webhookDispatch(
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
        return { ...p, parentId: u.parentId, order: u.order };
    });

    const paths: string[] = [];
    for (const node of updatedNodes) {
        const key = pageKey(node.id);
        await putProjectJson(projectId, key, node);
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
    return resolveAllUrlsFromTree(nodes, getEntriesForResolver, projectId);
}

export async function getNavigation(
    projectId: string,
    options?: { depth?: number; rootId?: string | null }
): Promise<NavigationNode[]> {
    const nodes = await loadAllPages(projectId);
    const nodeMap = buildNodeMap(nodes);
    const childMap = buildChildMap(nodes);
    return buildNavigationTree(nodes, nodeMap, childMap, options);
}

export async function resolveBreadcrumb(
    projectId: string,
    nodeId: string,
    entryId?: string
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
    return resolveBreadcrumbFromTree(nodeId, nodeMap, entry);
}

export async function resolveEntryUrl(
    projectId: string,
    entryId: string,
    modelId: string
): Promise<string | null> {
    const nodes = await loadAllPages(projectId);
    const nodeMap = buildNodeMap(nodes);
    const collectionPage = nodes.find(
        (n): n is CollectionPage => n.type === 'collection' && n.modelId === modelId
    );
    if (!collectionPage) return null;

    const entryStatus = collectionPage.entryStatus ?? 'published';
    const entries =
        entryStatus === 'published'
            ? await listPublishedEntriesForProject(projectId, modelId, { status: 'published' })
            : await listEntriesForProject(projectId, modelId, { status: entryStatus });
    const entry = entries.find(e => e.id === entryId);
    if (!entry) return null;

    const pattern = collectionPage.urlPattern ?? undefined;
    if (!pattern) return null;

    const prefix = resolveNodePrefix(collectionPage.id, nodeMap);
    const segment = interpolatePattern(pattern, entry);
    if (!segment) return null;
    return prefix ? `${prefix}/${segment}` : `/${segment}`;
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
