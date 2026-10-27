import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import {
    listCollections,
    getCollection,
    createCollection,
    updateCollection,
    deleteCollection
} from '@moteurio/core/apiCollections.js';
import { requireDeveloper } from '../../middlewares/auth.js';
import {
    getEntryForProject,
    getPublishedEntryForProject,
    queryEntriesForProject
} from '@moteurio/core/entries.js';
import { listPages, getPage, getPageBySlug, resolveEntryUrl } from '@moteurio/core/pages.js';
import { publicPage, publicPages } from '@moteurio/core/pages/publishedPages.js';
import type { PageNode } from '@moteurio/types/Page.js';
import { selectFields, selectFieldsFromList } from '@moteurio/core/fieldSelection.js';
import {
    resolveEntryReferences,
    type EntryResolver,
    type ReferenceSchemas
} from '@moteurio/core/referenceResolution.js';
import { EntryReadBudget } from '../../utils/entryReadBudget.js';
import { resolveEntryAssets, resolvePageAssets } from '@moteurio/core/assets/assetResolver.js';
import { getModelSchemaForProject } from '@moteurio/core/models.js';
import { getProjectById } from '@moteurio/core/projects.js';
import {
    localeSchemas,
    localizeEntry,
    localizeFields,
    type LocaleChoice,
    type LocaleSchemas
} from '@moteurio/core/entryLocaleResolution.js';
import {
    pageLinkContext,
    resolvePageLinks,
    type PageLinkContext,
    type PageLinkOptions
} from '@moteurio/core/pageLinks.js';
import {
    listNavigations,
    getNavigationByHandle,
    resolveNavigation
} from '@moteurio/core/navigations.js';
import { toPublicForm } from '../../utils/publicForm.js';
import { getProjectJson, listProjectKeys } from '@moteurio/core/utils/projectStorage.js';
import {
    layoutKey,
    layoutListPrefix,
    formKey,
    formListPrefix
} from '@moteurio/core/utils/storageKeys.js';
import type { Layout } from '@moteurio/types/Layout.js';
import type { FormSchema } from '@moteurio/types/Form.js';
import type { ApiCollectionResource } from '@moteurio/types/ApiCollection.js';
import type { Entry, EntryStatus, ModelSchema } from '@moteurio/types/Model.js';
import { sendApiError, getMessage } from '../../utils/apiError.js';
import type { EntryQuery } from '@moteurio/core/contentIndex/index.js';
import { entryQueryParameters, parseEntryQuery } from '../../utils/entryQuery.js';
import { queryFlag, resolveAssetsParameter, resolveUrlParameter } from '../../utils/queryFlag.js';
import {
    collectionPublicApiPaths,
    loadCollectionOpenApiDocument
} from '../../openapi/loadCollectionOpenApi.js';

const router: Router = Router({ mergeParams: true });

/**
 * Whether this request sees drafts, set on `req.previewAuth` for what follows. A preview link
 * made for the whole project shows every draft; one made for an entry or a page shows that one
 * as it is now, and everything else as published.
 */
function previewing(req: Request, item?: { entryId?: string; pageId?: string }): boolean {
    if (!req.previewTokenId) return (req.previewAuth = false);
    const { previewEntryId: entryId, previewPageId: pageId } = req;
    req.previewAuth =
        (!entryId && !pageId) ||
        (!!entryId && item?.entryId === entryId) ||
        (!!pageId && item?.pageId === pageId);
    return req.previewAuth;
}

router.use((req, _res, next) => {
    previewing(req);
    next();
});

async function respondCollectionOpenApi(req: Request, res: Response): Promise<void> {
    const { projectId, collectionId } = req.params as Record<string, string>;
    if (!projectId || !collectionId) {
        res.status(400).json({ error: 'Missing projectId or collectionId' });
        return;
    }
    if (rejectIfCollectionAccessForbidden(req, res, collectionId)) return;
    const doc = await loadCollectionOpenApiDocument(projectId, collectionId);
    if (!doc) {
        res.status(404).json({ error: 'Collection not found' });
        return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json(doc);
}

function parseLocaleQuery(req: Request): string | undefined {
    const raw = req.query.locale ?? req.query.lang;
    const s =
        typeof raw === 'string'
            ? raw.trim()
            : Array.isArray(raw) && typeof raw[0] === 'string'
              ? raw[0].trim()
              : '';
    return s || undefined;
}

/** Published-only snapshot when using a bare API key without preview or JWT. */
function isPublishedOnlyDelivery(req: Request): boolean {
    if (req.user) return false;
    if (req.previewAuth) return false;
    return Boolean(req.apiKeyAuth);
}

function getStatusFilter(
    resource: ApiCollectionResource,
    apiKeyOnly: boolean,
    previewAuth?: boolean
): EntryStatus[] {
    if (apiKeyOnly) return ['published'];
    const status = resource.filters?.status;
    if (status == null) {
        if (previewAuth) return ['draft', 'in_review', 'published'];
        return ['published'];
    }
    return Array.isArray(status) ? status : [status];
}

/**
 * The pages a link or a page relation may lead this reader to: those the channel gives (by its
 * page filter), or published pages when it gives none, with drafts too in a preview.
 */
function pageLinkOptions(
    collection: { resources: ApiCollectionResource[] },
    req: Request
): PageLinkOptions {
    const pageResource = collection.resources.find(r => r.resourceType === 'page');
    const statuses: string[] = pageResource
        ? getStatusFilter(pageResource, isPublishedOnlyDelivery(req), req.previewAuth)
        : req.previewAuth
          ? ['draft', 'published']
          : ['published'];
    return { isLive: page => statuses.includes(page.status), locale: parseLocaleQuery(req) };
}

/** What one delivery reads once and shares across its items. */
type Delivery = {
    projectId: string;
    /** Blocks, structures and model schemas, to walk into fields at any depth. */
    schemas: LocaleSchemas;
    links: PageLinkContext;
    linkOptions: PageLinkOptions;
    /** `?locale=`: every multilingual value comes down to this language. */
    choice?: LocaleChoice;
    resolveAssets: boolean;
};

async function deliveryFor(
    projectId: string,
    collection: { resources: ApiCollectionResource[] },
    req: Request
): Promise<Delivery> {
    const resource = collection.resources.find(r => r.resourceType === 'page');
    const links = await pageLinkContext(projectId, {
        published:
            !req.previewAuth &&
            (!resource ||
                usePublishedEntryView(
                    req,
                    getStatusFilter(resource, isPublishedOnlyDelivery(req), req.previewAuth)
                ))
    });
    const locale = parseLocaleQuery(req);
    return {
        projectId,
        schemas: await localeSchemas(projectId, links.schemas.blocks),
        links,
        linkOptions: pageLinkOptions(collection, req),
        choice: locale ? { locale, fallback: links.defaultLocale } : undefined,
        resolveAssets: queryFlag(req.query.resolveAssets)
    };
}

/** A page as delivered: links and page relations filled in, then one language, then pictures. */
async function deliverPage(page: PageNode, d: Delivery): Promise<PageNode> {
    if (page.type === 'folder') return page;
    const template = d.links.templates?.get(page.templateId);
    if (!template) return page;
    const own = template.fields as ModelSchema['fields'];
    let fields = (await resolvePageLinks(page.fields, own, d.links, d.linkOptions)) ?? page.fields;
    if (d.choice) fields = (await localizeFields(fields, own, d.schemas, d.choice)) ?? fields;
    const out = { ...page, fields };
    return d.resolveAssets ? resolvePageAssets(d.projectId, out, template, d.schemas) : out;
}

/** An entry as delivered, after its references are inlined: links, one language, pictures. */
async function deliverEntry(entry: Entry, schema: ModelSchema | null, d: Delivery): Promise<Entry> {
    if (!schema) return entry;
    const data = await resolvePageLinks(entry.data, schema.fields, d.links, d.linkOptions);
    let out: Entry = { ...entry, data: data ?? entry.data };
    if (d.choice) out = await localizeEntry(out, d.schemas, d.choice);
    return d.resolveAssets ? resolveEntryAssets(d.projectId, out, schema, d.schemas) : out;
}

/** Relations resolve by the model's schema, wherever they sit and however they are stored. */
const referenceSchemas = (d: Delivery): ReferenceSchemas => ({
    model: d.schemas.model!,
    walk: d.schemas
});

function usePublishedEntryView(req: Request, statuses: EntryStatus[]): boolean {
    if (req.previewAuth) return false;
    return statuses.length === 1 && statuses[0] === 'published';
}

function findResource(
    collection: { resources: ApiCollectionResource[] },
    resourceId: string
): ApiCollectionResource | undefined {
    return collection.resources.find(r => r.resourceId === resourceId);
}

function filterCollectionsForApiKey<T extends { id: string }>(req: Request, list: T[]): T[] {
    if (req.user) return list;
    const w = req.apiKeyPolicy?.collectionWhitelist;
    if (w == null) return list;
    const allow = new Set(w);
    return list.filter(c => allow.has(c.id));
}

function rejectIfApiKeyCollectionForbidden(
    req: Request,
    res: Response,
    collectionId: string
): boolean {
    if (req.user) return false;
    const w = req.apiKeyPolicy?.collectionWhitelist;
    if (w == null) return false;
    if (w.includes(collectionId)) return false;
    res.status(403).json({
        error: 'This API key cannot access this collection',
        code: 'API_KEY_COLLECTION_NOT_ALLOWED'
    });
    return true;
}

function rejectIfPreviewCollectionMismatch(
    req: Request,
    res: Response,
    collectionId: string
): boolean {
    if (!req.previewTokenId) return false;
    const scoped = req.previewCollectionId;
    if (!scoped || scoped === collectionId) return false;
    res.status(403).json({
        error: 'Preview token is not valid for this collection',
        code: 'PREVIEW_COLLECTION_MISMATCH'
    });
    return true;
}

function rejectIfCollectionAccessForbidden(
    req: Request,
    res: Response,
    collectionId: string
): boolean {
    return (
        rejectIfApiKeyCollectionForbidden(req, res, collectionId) ||
        rejectIfPreviewCollectionMismatch(req, res, collectionId)
    );
}

/**
 * A list read with a preview link made for one page: that page as it is now, in place of its
 * published version or added when it has none (when the channel gives pages like it).
 */
async function withPreviewedPage(
    req: Request,
    projectId: string,
    resource: ApiCollectionResource,
    pages: PageNode[]
): Promise<PageNode[]> {
    const id = req.previewPageId;
    if (!id || req.previewAuth) return pages;
    const page = await getPage(projectId, id).catch(() => null);
    if (!page || page.type === 'folder') return pages;
    if (resource.resourceId !== 'pages' && page.templateId !== resource.resourceId) return pages;
    if (!getStatusFilter(resource, false, true).includes(page.status as EntryStatus)) return pages;
    const at = pages.findIndex(p => p.id === id);
    return at < 0 ? [...pages, page] : pages.map(p => (p.id === id ? page : p));
}

/**
 * A list read with a preview link made for one entry: the rest as published, that entry as it
 * is now, where it sits now. It is left out when its edits no longer match the query, and
 * counted once more when it has never been published.
 */
async function withPreviewedEntry(
    req: Request,
    projectId: string,
    modelId: string,
    resource: ApiCollectionResource,
    query: EntryQuery,
    found: { items: Entry[]; total: number }
): Promise<{ items: Entry[]; total: number }> {
    const id = req.previewEntryId;
    if (!id || req.previewAuth) return found;
    const draft = await getEntryForProject(projectId, modelId, id).catch(() => null);
    if (!draft) return found;
    const { items: latest } = await queryEntriesForProject(projectId, modelId, {
        ...query,
        view: 'latest',
        status: getStatusFilter(resource, false, true)
    });
    const at = latest.findIndex(e => e.id === id);
    const items = found.items.filter(e => e.id !== id);
    if (at < 0) return { items, total: found.total };
    items.splice(Math.min(at, items.length), 0, latest[at]);
    const published = await getPublishedEntryForProject(projectId, modelId, id);
    return { items, total: found.total + (published ? 0 : 1) };
}

// GET /projects/:projectId/collections
router.get('/', async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        const list = await listCollections(projectId);
        return void res.json(filterCollectionsForApiKey(req, list));
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

// OpenAPI spec (register before `/:collectionId` — Express 5 path matching)
router.get('/:collectionId/openapi', async (req: Request, res: Response) => {
    try {
        await respondCollectionOpenApi(req, res);
    } catch (err: unknown) {
        sendApiError(res, req, err);
    }
});
router.get('/:collectionId/openapi.json', async (req: Request, res: Response) => {
    try {
        await respondCollectionOpenApi(req, res);
    } catch (err: unknown) {
        sendApiError(res, req, err);
    }
});

// GET /projects/:projectId/collections/:collectionId
router.get('/:collectionId', async (req: Request, res: Response) => {
    const { projectId, collectionId } = req.params as Record<string, string>;
    if (!projectId || !collectionId)
        return void res.status(400).json({ error: 'Missing projectId or collectionId' });
    if (rejectIfCollectionAccessForbidden(req, res, collectionId)) return;
    try {
        const collection = await getCollection(projectId, collectionId);
        if (!collection) return void res.status(404).json({ error: 'Collection not found' });
        return void res.json({
            ...collection,
            publicApi: collectionPublicApiPaths(projectId, collectionId)
        });
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

// Write routes (JWT + project access)
router.post('/', requireDeveloper, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        const { id, label, description, resources } = req.body ?? {};
        const collection = await createCollection(projectId, req.user!, {
            id,
            label: label ?? 'Unnamed',
            description,
            resources: resources ?? []
        });
        return void res.status(201).json(collection);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});
router.patch('/:collectionId', requireDeveloper, async (req: Request, res: Response) => {
    const { projectId, collectionId } = req.params as Record<string, string>;
    if (!projectId || !collectionId)
        return void res.status(400).json({ error: 'Missing projectId or collectionId' });
    try {
        const patch = req.body ?? {};
        const collection = await updateCollection(projectId, req.user!, collectionId, patch);
        return void res.json(collection);
    } catch (err: unknown) {
        return void res.status(getMessage(err)?.includes('not found') ? 404 : 400).json({
            error: getMessage(err) ?? 'Failed to update collection'
        });
    }
});
router.delete('/:collectionId', requireDeveloper, async (req: Request, res: Response) => {
    const { projectId, collectionId } = req.params as Record<string, string>;
    if (!projectId || !collectionId)
        return void res.status(400).json({ error: 'Missing projectId or collectionId' });
    try {
        await deleteCollection(projectId, req.user!, collectionId);
        return void res.status(204).send();
    } catch (err: unknown) {
        return void res.status(getMessage(err)?.includes('not found') ? 404 : 400).json({
            error: getMessage(err) ?? 'Failed to delete collection'
        });
    }
});

// GET /projects/:projectId/collections/:collectionId/pages
router.get('/:collectionId/pages', async (req: Request, res: Response) => {
    const { projectId, collectionId } = req.params as Record<string, string>;
    if (!projectId || !collectionId)
        return void res.status(400).json({ error: 'Missing projectId or collectionId' });
    if (rejectIfCollectionAccessForbidden(req, res, collectionId)) return;
    try {
        const collection = await getCollection(projectId, collectionId);
        if (!collection) return void res.status(404).json({ error: 'Collection not found' });
        const pageResource = collection.resources.find(r => r.resourceType === 'page');
        if (!pageResource)
            return void res.status(404).json({ error: 'Collection does not expose pages' });
        const apiKeyOnly = isPublishedOnlyDelivery(req);
        const statuses = getStatusFilter(pageResource, apiKeyOnly, req.previewAuth);
        let pages = await listPages(projectId, {
            templateId: pageResource.resourceId === 'pages' ? undefined : pageResource.resourceId
        });
        // Sites get each page as published; changes waiting for review stay out.
        if (usePublishedEntryView(req, statuses)) pages = await publicPages(projectId, pages);
        pages = pages.filter(p => 'status' in p && statuses.includes((p as any).status));
        pages = await withPreviewedPage(req, projectId, pageResource, pages);
        const delivery = await deliveryFor(projectId, collection, req);
        pages = await Promise.all(pages.map(p => deliverPage(p, delivery)));
        return void res.json(pages);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

// GET /projects/:projectId/collections/:collectionId/pages/by-slug/:slug
router.get('/:collectionId/pages/by-slug/:slug', async (req: Request, res: Response) => {
    const { projectId, collectionId, slug } = req.params as Record<string, string>;
    if (!projectId || !collectionId || slug === undefined)
        return void res.status(400).json({ error: 'Missing projectId, collectionId or slug' });
    if (rejectIfCollectionAccessForbidden(req, res, collectionId)) return;
    try {
        const collection = await getCollection(projectId, collectionId);
        if (!collection) return void res.status(404).json({ error: 'Collection not found' });
        const pageResource = collection.resources.find(r => r.resourceType === 'page');
        if (!pageResource)
            return void res.status(404).json({ error: 'Collection does not expose pages' });
        if (req.previewPageId) {
            const page = await getPageBySlug(projectId, slug, parseLocaleQuery(req));
            previewing(req, { pageId: page?.id });
        }
        const apiKeyOnly = isPublishedOnlyDelivery(req);
        const statuses = getStatusFilter(pageResource, apiKeyOnly, req.previewAuth);
        const stored = await getPageBySlug(projectId, slug, parseLocaleQuery(req), {
            published: usePublishedEntryView(req, statuses)
        });
        if (!stored) return void res.status(404).json({ error: 'Page not found' });
        if (!('status' in stored) || !statuses.includes((stored as any).status))
            return void res.status(404).json({ error: 'Page not found' });
        return void res.json(
            await deliverPage(stored, await deliveryFor(projectId, collection, req))
        );
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

// GET /projects/:projectId/collections/:collectionId/pages/:id
router.get('/:collectionId/pages/:id', async (req: Request, res: Response) => {
    const { projectId, collectionId, id } = req.params as Record<string, string>;
    if (!projectId || !collectionId || !id)
        return void res.status(400).json({ error: 'Missing projectId, collectionId or id' });
    if (rejectIfCollectionAccessForbidden(req, res, collectionId)) return;
    try {
        const collection = await getCollection(projectId, collectionId);
        if (!collection) return void res.status(404).json({ error: 'Collection not found' });
        const pageResource = collection.resources.find(r => r.resourceType === 'page');
        if (!pageResource)
            return void res.status(404).json({ error: 'Collection does not expose pages' });
        previewing(req, { pageId: id });
        const apiKeyOnly = isPublishedOnlyDelivery(req);
        const statuses = getStatusFilter(pageResource, apiKeyOnly, req.previewAuth);
        const file = await getPage(projectId, id);
        const stored = usePublishedEntryView(req, statuses)
            ? await publicPage(projectId, file)
            : file;
        if (!stored) return void res.status(404).json({ error: 'Page not found' });
        if (!('status' in stored) || !statuses.includes((stored as any).status))
            return void res.status(404).json({ error: 'Page not found' });
        return void res.json(
            await deliverPage(stored, await deliveryFor(projectId, collection, req))
        );
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

// GET /projects/:projectId/collections/:collectionId/:resourceId/entries
router.get('/:collectionId/:resourceId/entries', async (req: Request, res: Response) => {
    const { projectId, collectionId, resourceId } = req.params as Record<string, string>;
    if (!projectId || !collectionId || !resourceId)
        return void res.status(400).json({ error: 'Missing path parameters' });
    if (rejectIfCollectionAccessForbidden(req, res, collectionId)) return;
    try {
        const collection = await getCollection(projectId, collectionId);
        if (!collection) return void res.status(404).json({ error: 'Collection not found' });
        const resource =
            findResource(collection, resourceId) ??
            collection.resources.find(r => r.resourceType === 'model' && r.resourceId === 'models');
        if (!resource || resource.resourceType !== 'model')
            return void res.status(404).json({ error: 'Resource not found in collection' });
        const apiKeyOnly = isPublishedOnlyDelivery(req);
        const statuses = getStatusFilter(resource, apiKeyOnly, req.previewAuth);
        const usePublished = usePublishedEntryView(req, statuses);
        let parsed: EntryQuery;
        try {
            parsed = parseEntryQuery(req, { allowStatus: false });
        } catch (err: unknown) {
            return void res.status(400).json({ error: (err as Error).message });
        }
        const found = await queryEntriesForProject(projectId, resourceId, {
            ...parsed,
            view: usePublished ? 'published' : 'latest',
            status: statuses
        });
        const { items: entries, total } = await withPreviewedEntry(
            req,
            projectId,
            resourceId,
            resource,
            parsed,
            found
        );
        res.setHeader('X-Total-Count', String(total));
        const depth = (resource.resolve ?? 0) as 0 | 1 | 2;
        const fields = resource.fields && resource.fields.length > 0 ? resource.fields : undefined;
        const readBudget = new EntryReadBudget(
            usePublished ? getPublishedEntryForProject : getEntryForProject
        );
        entries.forEach(entry => readBudget.include(entry));
        const resolver: EntryResolver = readBudget.resolve;
        const delivery = await deliveryFor(projectId, collection, req);
        const references = referenceSchemas(delivery);
        const schema = await getModelSchemaForProject(projectId, resourceId);
        const resolved = await Promise.all(
            entries.map(async e =>
                deliverEntry(
                    await resolveEntryReferences(
                        e,
                        projectId,
                        resourceId,
                        depth,
                        new Set(),
                        statuses,
                        resolver,
                        references
                    ),
                    schema,
                    delivery
                )
            )
        );
        const locale = delivery.choice?.locale;
        let projected = selectFieldsFromList(resolved, fields);
        if (queryFlag(req.query.resolveUrl)) {
            projected = await Promise.all(
                projected.map(async (item: any) => {
                    const url = await resolveEntryUrl(projectId, item.id, resourceId, locale);
                    return { ...item, ...(url != null && { resolvedUrl: url }) };
                })
            );
        }
        return void res.json(projected);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

// GET /projects/:projectId/collections/:collectionId/:resourceId/entries/:id
router.get('/:collectionId/:resourceId/entries/:id', async (req: Request, res: Response) => {
    const { projectId, collectionId, resourceId, id } = req.params as Record<string, string>;
    if (!projectId || !collectionId || !resourceId || !id)
        return void res.status(400).json({ error: 'Missing path parameters' });
    if (rejectIfCollectionAccessForbidden(req, res, collectionId)) return;
    try {
        const collection = await getCollection(projectId, collectionId);
        if (!collection) return void res.status(404).json({ error: 'Collection not found' });
        const resource =
            findResource(collection, resourceId) ??
            collection.resources.find(r => r.resourceType === 'model' && r.resourceId === 'models');
        if (!resource || resource.resourceType !== 'model')
            return void res.status(404).json({ error: 'Resource not found in collection' });
        previewing(req, { entryId: id });
        const apiKeyOnly = isPublishedOnlyDelivery(req);
        const statuses = getStatusFilter(resource, apiKeyOnly, req.previewAuth);
        const usePublished = usePublishedEntryView(req, statuses);
        const entry = usePublished
            ? await getPublishedEntryForProject(projectId, resourceId, id)
            : await getEntryForProject(projectId, resourceId, id);
        if (!entry) return void res.status(404).json({ error: 'Entry not found' });
        if (!statuses.includes((entry.status ?? 'draft') as EntryStatus))
            return void res.status(404).json({ error: 'Entry not found' });
        const depth = (resource.resolve ?? 0) as 0 | 1 | 2;
        const readBudget = new EntryReadBudget(
            usePublished ? getPublishedEntryForProject : getEntryForProject
        );
        readBudget.include(entry);
        const singleResolver: EntryResolver = readBudget.resolve;
        const delivery = await deliveryFor(projectId, collection, req);
        const resolved = await deliverEntry(
            await resolveEntryReferences(
                entry,
                projectId,
                resourceId,
                depth,
                new Set(),
                statuses,
                singleResolver,
                referenceSchemas(delivery)
            ),
            await getModelSchemaForProject(projectId, resourceId),
            delivery
        );
        const localeOne = delivery.choice?.locale;
        const fields = resource.fields && resource.fields.length > 0 ? resource.fields : undefined;
        let projected = selectFields(resolved, fields);
        if (queryFlag(req.query.resolveUrl)) {
            const url = await resolveEntryUrl(projectId, id, resourceId, localeOne);
            projected = { ...projected, ...(url != null && { resolvedUrl: url }) };
        }
        return void res.json(projected);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

// GET /projects/:projectId/collections/:collectionId/layouts
router.get('/:collectionId/layouts', async (req: Request, res: Response) => {
    const { projectId, collectionId } = req.params as Record<string, string>;
    if (!projectId || !collectionId)
        return void res.status(400).json({ error: 'Missing projectId or collectionId' });
    if (rejectIfCollectionAccessForbidden(req, res, collectionId)) return;
    try {
        const collection = await getCollection(projectId, collectionId);
        if (!collection) return void res.status(404).json({ error: 'Collection not found' });
        const layoutResource = collection.resources.find(r => r.resourceType === 'layout');
        if (!layoutResource)
            return void res.status(404).json({ error: 'Collection does not expose layouts' });
        let layouts: Layout[];
        if (layoutResource.resourceId === 'layouts') {
            const ids = await listProjectKeys(projectId, layoutListPrefix());
            layouts = (
                await Promise.all(ids.map(id => getProjectJson<Layout>(projectId, layoutKey(id))))
            ).filter((l): l is Layout => l != null);
        } else {
            const layout = await getProjectJson<Layout>(
                projectId,
                layoutKey(layoutResource.resourceId)
            );
            layouts = layout ? [layout] : [];
        }
        return void res.json(layouts);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

// GET /projects/:projectId/collections/:collectionId/layouts/:id
router.get('/:collectionId/layouts/:id', async (req: Request, res: Response) => {
    const { projectId, collectionId, id } = req.params as Record<string, string>;
    if (!projectId || !collectionId || !id)
        return void res.status(400).json({ error: 'Missing path parameters' });
    if (rejectIfCollectionAccessForbidden(req, res, collectionId)) return;
    try {
        const collection = await getCollection(projectId, collectionId);
        if (!collection) return void res.status(404).json({ error: 'Collection not found' });
        const layoutResource = collection.resources.find(r => r.resourceType === 'layout');
        if (!layoutResource)
            return void res.status(404).json({ error: 'Collection does not expose layouts' });
        if (layoutResource.resourceId !== 'layouts' && layoutResource.resourceId !== id)
            return void res.status(404).json({ error: 'Layout not found in collection' });
        const layout = await getProjectJson<Layout>(projectId, layoutKey(id));
        if (!layout) return void res.status(404).json({ error: 'Layout not found' });
        return void res.json(layout);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

// GET /projects/:projectId/collections/:collectionId/forms
router.get('/:collectionId/forms', async (req: Request, res: Response) => {
    const { projectId, collectionId } = req.params as Record<string, string>;
    if (!projectId || !collectionId)
        return void res.status(400).json({ error: 'Missing projectId or collectionId' });
    if (rejectIfCollectionAccessForbidden(req, res, collectionId)) return;
    try {
        const collection = await getCollection(projectId, collectionId);
        if (!collection) return void res.status(404).json({ error: 'Collection not found' });
        const formResource = collection.resources.find(r => r.resourceType === 'form');
        if (!formResource)
            return void res.status(404).json({ error: 'Collection does not expose forms' });
        let forms: FormSchema[];
        if (formResource.resourceId === 'forms') {
            const ids = await listProjectKeys(projectId, formListPrefix());
            forms = (
                await Promise.all(ids.map(id => getProjectJson<FormSchema>(projectId, formKey(id))))
            ).filter((f): f is FormSchema => f != null);
        } else {
            const form = await getProjectJson<FormSchema>(
                projectId,
                formKey(formResource.resourceId)
            );
            forms = form ? [form] : [];
        }
        const locale = typeof req.query.locale === 'string' ? req.query.locale : undefined;
        return void res.json(
            forms.filter(f => f.status === 'active').map(f => toPublicForm(f, locale))
        );
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

// GET /projects/:projectId/collections/:collectionId/forms/:id
router.get('/:collectionId/forms/:id', async (req: Request, res: Response) => {
    const { projectId, collectionId, id } = req.params as Record<string, string>;
    if (!projectId || !collectionId || !id)
        return void res.status(400).json({ error: 'Missing path parameters' });
    if (rejectIfCollectionAccessForbidden(req, res, collectionId)) return;
    try {
        const collection = await getCollection(projectId, collectionId);
        if (!collection) return void res.status(404).json({ error: 'Collection not found' });
        const formResource = collection.resources.find(r => r.resourceType === 'form');
        if (!formResource)
            return void res.status(404).json({ error: 'Collection does not expose forms' });
        if (formResource.resourceId !== 'forms' && formResource.resourceId !== id)
            return void res.status(404).json({ error: 'Form not found in collection' });
        const form = await getProjectJson<FormSchema>(projectId, formKey(id));
        if (!form || form.status !== 'active')
            return void res.status(404).json({ error: 'Form not found' });
        const locale = typeof req.query.locale === 'string' ? req.query.locale : undefined;
        return void res.json(toPublicForm(form, locale));
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

/** `?locale=` picks one language for each item label. Absent means the stored map is returned. */
async function menuLanguage(
    projectId: string,
    req: Request
): Promise<{ locale: string; fallback: string } | undefined> {
    const locale = parseLocaleQuery(req);
    if (!locale) return undefined;
    const project = await getProjectById(projectId);
    return { locale, fallback: project?.defaultLocale || 'en' };
}

/** Menu handles the channel gives, or `null` when it gives every menu. Empty when it gives none. */
function menuHandles(collection: { resources: ApiCollectionResource[] }): string[] | null {
    const rows = collection.resources.filter(r => r.resourceType === 'menu');
    if (rows.some(r => r.resourceId === 'menus')) return null;
    return rows.map(r => r.resourceId);
}

// GET /projects/:projectId/collections/:collectionId/menus
router.get('/:collectionId/menus', async (req: Request, res: Response) => {
    const { projectId, collectionId } = req.params as Record<string, string>;
    if (!projectId || !collectionId)
        return void res.status(400).json({ error: 'Missing projectId or collectionId' });
    if (rejectIfCollectionAccessForbidden(req, res, collectionId)) return;
    try {
        const collection = await getCollection(projectId, collectionId);
        if (!collection) return void res.status(404).json({ error: 'Collection not found' });
        const handles = menuHandles(collection);
        if (handles?.length === 0)
            return void res.status(404).json({ error: 'Collection does not expose menus' });
        const all = await listNavigations(projectId);
        const menus = handles === null ? all : all.filter(n => handles.includes(n.handle));
        const language = await menuLanguage(projectId, req);
        return void res.json(
            await Promise.all(menus.map(n => resolveNavigation(projectId, n, language)))
        );
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

// GET /projects/:projectId/collections/:collectionId/menus/:handle
router.get('/:collectionId/menus/:handle', async (req: Request, res: Response) => {
    const { projectId, collectionId, handle } = req.params as Record<string, string>;
    if (!projectId || !collectionId || !handle)
        return void res.status(400).json({ error: 'Missing path parameters' });
    if (rejectIfCollectionAccessForbidden(req, res, collectionId)) return;
    try {
        const collection = await getCollection(projectId, collectionId);
        if (!collection) return void res.status(404).json({ error: 'Collection not found' });
        const handles = menuHandles(collection);
        if (handles?.length === 0)
            return void res.status(404).json({ error: 'Collection does not expose menus' });
        if (handles !== null && !handles.includes(handle))
            return void res.status(404).json({ error: 'Menu not found in collection' });
        const nav = await getNavigationByHandle(projectId, handle);
        if (!nav) return void res.status(404).json({ error: 'Menu not found' });
        const language = await menuLanguage(projectId, req);
        return void res.json(await resolveNavigation(projectId, nav, language));
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

const jsonErrorBody = {
    content: {
        'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' }
        }
    }
};

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/collections': {
        get: {
            summary: 'List collections (API key or JWT)',
            tags: ['Public API — Collections'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'List of collections',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'array',
                                items: { $ref: '#/components/schemas/ApiCollection' }
                            }
                        }
                    }
                }
            }
        },
        post: {
            summary: 'Create a collection (JWT + project access)',
            tags: ['Public API — Collections'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                id: { type: 'string' },
                                label: { type: 'string' },
                                description: { type: 'string' },
                                resources: {
                                    type: 'array',
                                    items: { $ref: '#/components/schemas/ApiCollectionResource' }
                                }
                            }
                        }
                    }
                }
            },
            responses: {
                '201': {
                    description: 'Created',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ApiCollection' }
                        }
                    }
                }
            }
        }
    },
    '/projects/{projectId}/collections/{collectionId}': {
        get: {
            summary: 'Get one collection',
            tags: ['Public API — Collections'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'collectionId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Collection',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ApiCollection' }
                        }
                    }
                },
                '404': { description: 'Not found', ...jsonErrorBody }
            }
        },
        patch: {
            summary: 'Update a collection',
            tags: ['Public API — Collections'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'collectionId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                content: {
                    'application/json': {
                        schema: { type: 'object', additionalProperties: true }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Updated collection',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ApiCollection' }
                        }
                    }
                },
                '400': { description: 'Bad request', ...jsonErrorBody },
                '404': { description: 'Not found', ...jsonErrorBody }
            }
        },
        delete: {
            summary: 'Delete a collection',
            tags: ['Public API — Collections'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'collectionId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '204': { description: 'Deleted' },
                '400': { description: 'Bad request', ...jsonErrorBody },
                '404': { description: 'Not found', ...jsonErrorBody }
            }
        }
    },
    '/projects/{projectId}/collections/{collectionId}/{resourceId}/entries': {
        get: {
            summary: 'List entries for a collection resource (model)',
            tags: ['Public API — Collections'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'collectionId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'resourceId', in: 'path', required: true, schema: { type: 'string' } },
                {
                    name: 'locale',
                    in: 'query',
                    required: false,
                    schema: { type: 'string' },
                    description:
                        'When set, resolves multilingual field values to this locale (falls back to project defaultLocale).'
                },
                {
                    name: 'lang',
                    in: 'query',
                    required: false,
                    schema: { type: 'string' },
                    description: 'Alias for locale.'
                },
                ...entryQueryParameters({ allowStatus: false }),
                resolveAssetsParameter(),
                resolveUrlParameter()
            ],
            responses: {
                '200': {
                    description:
                        'Entries. The X-Total-Count header holds the number of matching entries before limit/offset.',
                    headers: {
                        'X-Total-Count': { schema: { type: 'integer' } }
                    },
                    content: {
                        'application/json': {
                            schema: {
                                type: 'array',
                                items: { $ref: '#/components/schemas/Entry' }
                            }
                        }
                    }
                },
                '400': { description: 'Invalid limit, offset or sort', ...jsonErrorBody },
                '404': { description: 'Not found', ...jsonErrorBody }
            }
        }
    },
    '/projects/{projectId}/collections/{collectionId}/{resourceId}/entries/{id}': {
        get: {
            summary: 'Get one entry in a collection',
            tags: ['Public API — Collections'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'collectionId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'resourceId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
                {
                    name: 'locale',
                    in: 'query',
                    required: false,
                    schema: { type: 'string' },
                    description:
                        'When set, resolves multilingual field values to this locale (falls back to project defaultLocale).'
                },
                {
                    name: 'lang',
                    in: 'query',
                    required: false,
                    schema: { type: 'string' },
                    description: 'Alias for locale.'
                },
                resolveAssetsParameter(),
                resolveUrlParameter()
            ],
            responses: {
                '200': {
                    description: 'Entry',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/Entry' }
                        }
                    }
                },
                '404': { description: 'Not found', ...jsonErrorBody }
            }
        }
    },
    '/projects/{projectId}/collections/{collectionId}/openapi': {
        get: {
            summary: 'OpenAPI document for this collection (frontend)',
            description:
                'Auto-generated spec: concrete paths, query params, and `entry.data` shapes for each model the collection exposes ("every model" expands to all project models). Also served at `/openapi.json`. Same auth as other collection reads.',
            tags: ['Public API — Collections'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'collectionId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'OpenAPI 3 document',
                    content: {
                        'application/json': {
                            schema: { type: 'object', additionalProperties: true }
                        }
                    }
                },
                '404': { description: 'Not found', ...jsonErrorBody }
            }
        }
    },
    '/projects/{projectId}/collections/{collectionId}/pages': {
        get: {
            summary: 'List pages in a collection',
            tags: ['Public API — Collections'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'collectionId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Pages',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'array',
                                items: { $ref: '#/components/schemas/CollectionPageNode' }
                            }
                        }
                    }
                },
                '404': { description: 'Not found', ...jsonErrorBody }
            }
        }
    },
    '/projects/{projectId}/collections/{collectionId}/pages/{id}': {
        get: {
            summary: 'Get one page by id',
            tags: ['Public API — Collections'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'collectionId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Page',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/CollectionPageNode' }
                        }
                    }
                },
                '404': { description: 'Not found', ...jsonErrorBody }
            }
        }
    },
    '/projects/{projectId}/collections/{collectionId}/pages/by-slug/{slug}': {
        get: {
            summary: 'Get one page by slug',
            tags: ['Public API — Collections'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'collectionId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'slug', in: 'path', required: true, schema: { type: 'string' } },
                {
                    name: 'locale',
                    in: 'query',
                    schema: { type: 'string' },
                    description:
                        "Match the page's slug in this language (a page without one answers to its default slug). Without it, a slug in any language matches."
                }
            ],
            responses: {
                '200': {
                    description: 'Page',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/CollectionPageNode' }
                        }
                    }
                },
                '404': { description: 'Not found', ...jsonErrorBody }
            }
        }
    },
    '/projects/{projectId}/collections/{collectionId}/layouts': {
        get: {
            summary: 'List layouts exposed by the collection',
            tags: ['Public API — Collections'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'collectionId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Layouts',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'array',
                                items: { type: 'object', additionalProperties: true }
                            }
                        }
                    }
                },
                '404': { description: 'Not found', ...jsonErrorBody }
            }
        }
    },
    '/projects/{projectId}/collections/{collectionId}/layouts/{id}': {
        get: {
            summary: 'Get one layout by id',
            tags: ['Public API — Collections'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'collectionId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Layout',
                    content: {
                        'application/json': {
                            schema: { type: 'object', additionalProperties: true }
                        }
                    }
                },
                '404': { description: 'Not found', ...jsonErrorBody }
            }
        }
    },
    '/projects/{projectId}/collections/{collectionId}/forms': {
        get: {
            summary: 'List forms exposed by the collection',
            tags: ['Public API — Collections'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'collectionId', in: 'path', required: true, schema: { type: 'string' } },
                {
                    name: 'locale',
                    in: 'query',
                    schema: { type: 'string' },
                    description:
                        'Every label, hint, choice and message in this language (fr-CA reads fr). Absent: each is as written, one text or one per language.'
                }
            ],
            responses: {
                '200': {
                    description: 'Forms',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'array',
                                items: { $ref: '#/components/schemas/FormSchemaDoc' }
                            }
                        }
                    }
                },
                '404': { description: 'Not found', ...jsonErrorBody }
            }
        }
    },
    '/projects/{projectId}/collections/{collectionId}/forms/{id}': {
        get: {
            summary: 'Get one form by id',
            tags: ['Public API — Collections'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'collectionId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
                {
                    name: 'locale',
                    in: 'query',
                    schema: { type: 'string' },
                    description:
                        'Every label, hint, choice and message in this language (fr-CA reads fr). Absent: each is as written, one text or one per language.'
                }
            ],
            responses: {
                '200': {
                    description: 'Form',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/FormSchemaDoc' }
                        }
                    }
                },
                '404': { description: 'Not found', ...jsonErrorBody }
            }
        }
    },
    '/projects/{projectId}/collections/{collectionId}/menus': {
        get: {
            summary: 'List menus exposed by the collection, with item URLs resolved',
            tags: ['Public API — Collections'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'collectionId', in: 'path', required: true, schema: { type: 'string' } },
                {
                    name: 'locale',
                    in: 'query',
                    schema: { type: 'string' },
                    description:
                        'Return each item label in this language. Falls back to the project default. Omit to keep one value per language.'
                }
            ],
            responses: {
                '200': {
                    description: 'Menus',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'array',
                                items: { type: 'object', additionalProperties: true }
                            }
                        }
                    }
                },
                '404': { description: 'Not found', ...jsonErrorBody }
            }
        }
    },
    '/projects/{projectId}/collections/{collectionId}/menus/{handle}': {
        get: {
            summary: 'Get one menu by handle, with item URLs resolved',
            tags: ['Public API — Collections'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'collectionId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'handle', in: 'path', required: true, schema: { type: 'string' } },
                {
                    name: 'locale',
                    in: 'query',
                    schema: { type: 'string' },
                    description:
                        'Return each item label in this language. Falls back to the project default. Omit to keep one value per language.'
                }
            ],
            responses: {
                '200': {
                    description: 'Menu',
                    content: {
                        'application/json': {
                            schema: { type: 'object', additionalProperties: true }
                        }
                    }
                },
                '404': { description: 'Not found', ...jsonErrorBody }
            }
        }
    }
};

export default router;
