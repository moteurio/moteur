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
import { requireProjectAccess } from '../../middlewares/auth.js';
import {
    listEntriesForProject,
    getEntryForProject,
    listPublishedEntriesForProject,
    getPublishedEntryForProject
} from '@moteurio/core/entries.js';
import { listPages, getPage, getPageBySlug, resolveEntryUrl } from '@moteurio/core/pages.js';
import type { PageNode } from '@moteurio/types/Page.js';
import { selectFields, selectFieldsFromList } from '@moteurio/core/fieldSelection.js';
import { resolveEntryReferences, type EntryResolver } from '@moteurio/core/referenceResolution.js';
import { resolveEntryAssets, resolvePageAssets } from '@moteurio/core/assets/assetResolver.js';
import { getModelSchemaForProject } from '@moteurio/core/models.js';
import { getProjectById } from '@moteurio/core/projects.js';
import { listBlocks } from '@moteurio/core/blocks.js';
import { resolveEntryDataForLocaleDeep } from '@moteurio/core/entryLocaleResolution.js';
import { getTemplate } from '@moteurio/core/templates.js';
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
import type { EntryStatus } from '@moteurio/types/Model.js';
import { sendApiError, getMessage } from '../../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

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

function getStatusFilter(resource: ApiCollectionResource, apiKeyOnly: boolean): EntryStatus[] {
    if (apiKeyOnly) return ['published'];
    const status = resource.filters?.status;
    if (status == null) return ['published'];
    return Array.isArray(status) ? status : [status];
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

// GET /projects/:projectId/collections
router.get('/', async (req: Request, res: Response) => {
    const { projectId } = req.params;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        const list = await listCollections(projectId);
        return void res.json(filterCollectionsForApiKey(req, list));
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

// GET /projects/:projectId/collections/:collectionId
router.get('/:collectionId', async (req: Request, res: Response) => {
    const { projectId, collectionId } = req.params;
    if (!projectId || !collectionId)
        return void res.status(400).json({ error: 'Missing projectId or collectionId' });
    if (rejectIfApiKeyCollectionForbidden(req, res, collectionId)) return;
    try {
        const collection = await getCollection(projectId, collectionId);
        if (!collection) return void res.status(404).json({ error: 'Collection not found' });
        return void res.json(collection);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

// Write routes (JWT + project access)
router.post('/', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params;
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
router.patch('/:collectionId', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, collectionId } = req.params;
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
router.delete('/:collectionId', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, collectionId } = req.params;
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
    const { projectId, collectionId } = req.params;
    if (!projectId || !collectionId)
        return void res.status(400).json({ error: 'Missing projectId or collectionId' });
    if (rejectIfApiKeyCollectionForbidden(req, res, collectionId)) return;
    try {
        const collection = await getCollection(projectId, collectionId);
        if (!collection) return void res.status(404).json({ error: 'Collection not found' });
        const pageResource = collection.resources.find(r => r.resourceType === 'page');
        if (!pageResource)
            return void res.status(404).json({ error: 'Collection does not expose pages' });
        const apiKeyOnly = !req.user && Boolean(req.apiKeyAuth);
        const statuses = getStatusFilter(pageResource, apiKeyOnly);
        let pages = await listPages(projectId, {
            templateId: pageResource.resourceId === 'pages' ? undefined : pageResource.resourceId
        });
        pages = pages.filter(p => 'status' in p && statuses.includes((p as any).status));
        if (req.query.resolveAssets === '1') {
            pages = await Promise.all(
                pages.map(async p => {
                    if (p.type === 'folder' || !('templateId' in p)) return p;
                    const template = await getTemplate(projectId, (p as any).templateId);
                    return resolvePageAssets(projectId, p as any, template) as Promise<PageNode>;
                })
            );
        }
        return void res.json(pages);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

// GET /projects/:projectId/collections/:collectionId/pages/by-slug/:slug
router.get('/:collectionId/pages/by-slug/:slug', async (req: Request, res: Response) => {
    const { projectId, collectionId, slug } = req.params;
    if (!projectId || !collectionId || slug === undefined)
        return void res.status(400).json({ error: 'Missing projectId, collectionId or slug' });
    if (rejectIfApiKeyCollectionForbidden(req, res, collectionId)) return;
    try {
        const collection = await getCollection(projectId, collectionId);
        if (!collection) return void res.status(404).json({ error: 'Collection not found' });
        const pageResource = collection.resources.find(r => r.resourceType === 'page');
        if (!pageResource)
            return void res.status(404).json({ error: 'Collection does not expose pages' });
        const page = await getPageBySlug(projectId, slug);
        if (!page) return void res.status(404).json({ error: 'Page not found' });
        const apiKeyOnly = !req.user && Boolean(req.apiKeyAuth);
        const statuses = getStatusFilter(pageResource, apiKeyOnly);
        if (!('status' in page) || !statuses.includes((page as any).status))
            return void res.status(404).json({ error: 'Page not found' });
        if (req.query.resolveAssets === '1' && 'templateId' in page) {
            const template = await getTemplate(projectId, (page as any).templateId);
            const resolved = await resolvePageAssets(projectId, page as any, template);
            return void res.json(resolved);
        }
        return void res.json(page);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

// GET /projects/:projectId/collections/:collectionId/pages/:id
router.get('/:collectionId/pages/:id', async (req: Request, res: Response) => {
    const { projectId, collectionId, id } = req.params;
    if (!projectId || !collectionId || !id)
        return void res.status(400).json({ error: 'Missing projectId, collectionId or id' });
    if (rejectIfApiKeyCollectionForbidden(req, res, collectionId)) return;
    try {
        const collection = await getCollection(projectId, collectionId);
        if (!collection) return void res.status(404).json({ error: 'Collection not found' });
        const pageResource = collection.resources.find(r => r.resourceType === 'page');
        if (!pageResource)
            return void res.status(404).json({ error: 'Collection does not expose pages' });
        const page = await getPage(projectId, id);
        const apiKeyOnly = !req.user && Boolean(req.apiKeyAuth);
        const statuses = getStatusFilter(pageResource, apiKeyOnly);
        if (!('status' in page) || !statuses.includes((page as any).status))
            return void res.status(404).json({ error: 'Page not found' });
        if (req.query.resolveAssets === '1' && 'templateId' in page) {
            const template = await getTemplate(projectId, (page as any).templateId);
            const resolved = await resolvePageAssets(projectId, page as any, template);
            return void res.json(resolved);
        }
        return void res.json(page);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

// GET /projects/:projectId/collections/:collectionId/:resourceId/entries
router.get('/:collectionId/:resourceId/entries', async (req: Request, res: Response) => {
    const { projectId, collectionId, resourceId } = req.params;
    if (!projectId || !collectionId || !resourceId)
        return void res.status(400).json({ error: 'Missing path parameters' });
    if (rejectIfApiKeyCollectionForbidden(req, res, collectionId)) return;
    try {
        const collection = await getCollection(projectId, collectionId);
        if (!collection) return void res.status(404).json({ error: 'Collection not found' });
        const resource =
            findResource(collection, resourceId) ??
            collection.resources.find(r => r.resourceType === 'model' && r.resourceId === 'models');
        if (!resource || resource.resourceType !== 'model')
            return void res.status(404).json({ error: 'Resource not found in collection' });
        const apiKeyOnly = !req.user && Boolean(req.apiKeyAuth);
        const statuses = getStatusFilter(resource, apiKeyOnly);
        const usePublished = statuses.length === 1 && statuses[0] === 'published';
        let entries = usePublished
            ? await listPublishedEntriesForProject(projectId, resourceId, { status: statuses })
            : await listEntriesForProject(projectId, resourceId, { status: statuses });
        const depth = (resource.resolve ?? 0) as 0 | 1 | 2;
        const fields = resource.fields && resource.fields.length > 0 ? resource.fields : undefined;
        const resolver: EntryResolver | undefined = usePublished
            ? getPublishedEntryForProject
            : undefined;
        let resolved = await Promise.all(
            entries.map(e =>
                resolveEntryReferences(
                    e,
                    projectId,
                    resourceId,
                    depth,
                    new Set(),
                    statuses,
                    resolver
                )
            )
        );
        const locale = parseLocaleQuery(req);
        if (locale) {
            const project = await getProjectById(projectId);
            const fallback = project?.defaultLocale ?? 'en';
            const blockRegistry = listBlocks(projectId);
            resolved = await Promise.all(
                resolved.map(e =>
                    resolveEntryDataForLocaleDeep(e, projectId, locale, fallback, blockRegistry)
                )
            );
        }
        if (req.query.resolveAssets === '1') {
            const schema = await getModelSchemaForProject(projectId, resourceId);
            if (schema) {
                resolved = await Promise.all(
                    resolved.map(e => resolveEntryAssets(projectId, e, schema))
                );
            }
        }
        let projected = selectFieldsFromList(resolved, fields);
        if (req.query.resolveUrl === '1') {
            projected = await Promise.all(
                projected.map(async (item: any) => {
                    const url = await resolveEntryUrl(projectId, item.id, resourceId);
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
    const { projectId, collectionId, resourceId, id } = req.params;
    if (!projectId || !collectionId || !resourceId || !id)
        return void res.status(400).json({ error: 'Missing path parameters' });
    if (rejectIfApiKeyCollectionForbidden(req, res, collectionId)) return;
    try {
        const collection = await getCollection(projectId, collectionId);
        if (!collection) return void res.status(404).json({ error: 'Collection not found' });
        const resource =
            findResource(collection, resourceId) ??
            collection.resources.find(r => r.resourceType === 'model' && r.resourceId === 'models');
        if (!resource || resource.resourceType !== 'model')
            return void res.status(404).json({ error: 'Resource not found in collection' });
        const apiKeyOnly = !req.user && Boolean(req.apiKeyAuth);
        const statuses = getStatusFilter(resource, apiKeyOnly);
        const usePublished = statuses.length === 1 && statuses[0] === 'published';
        const entry = usePublished
            ? await getPublishedEntryForProject(projectId, resourceId, id)
            : await getEntryForProject(projectId, resourceId, id);
        if (!entry) return void res.status(404).json({ error: 'Entry not found' });
        if (!statuses.includes((entry.status ?? 'draft') as EntryStatus))
            return void res.status(404).json({ error: 'Entry not found' });
        const depth = (resource.resolve ?? 0) as 0 | 1 | 2;
        const singleResolver: EntryResolver | undefined = usePublished
            ? getPublishedEntryForProject
            : undefined;
        let resolved = await resolveEntryReferences(
            entry,
            projectId,
            resourceId,
            depth,
            new Set(),
            statuses,
            singleResolver
        );
        const localeOne = parseLocaleQuery(req);
        if (localeOne) {
            const project = await getProjectById(projectId);
            const fallback = project?.defaultLocale ?? 'en';
            const blockRegistry = listBlocks(projectId);
            resolved = await resolveEntryDataForLocaleDeep(
                resolved,
                projectId,
                localeOne,
                fallback,
                blockRegistry
            );
        }
        if (req.query.resolveAssets === '1') {
            const schema = await getModelSchemaForProject(projectId, resourceId);
            if (schema) resolved = await resolveEntryAssets(projectId, resolved, schema);
        }
        const fields = resource.fields && resource.fields.length > 0 ? resource.fields : undefined;
        let projected = selectFields(resolved, fields);
        if (req.query.resolveUrl === '1') {
            const url = await resolveEntryUrl(projectId, id, resourceId);
            projected = { ...projected, ...(url != null && { resolvedUrl: url }) };
        }
        return void res.json(projected);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

// GET /projects/:projectId/collections/:collectionId/layouts
router.get('/:collectionId/layouts', async (req: Request, res: Response) => {
    const { projectId, collectionId } = req.params;
    if (!projectId || !collectionId)
        return void res.status(400).json({ error: 'Missing projectId or collectionId' });
    if (rejectIfApiKeyCollectionForbidden(req, res, collectionId)) return;
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
    const { projectId, collectionId, id } = req.params;
    if (!projectId || !collectionId || !id)
        return void res.status(400).json({ error: 'Missing path parameters' });
    if (rejectIfApiKeyCollectionForbidden(req, res, collectionId)) return;
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
    const { projectId, collectionId } = req.params;
    if (!projectId || !collectionId)
        return void res.status(400).json({ error: 'Missing projectId or collectionId' });
    if (rejectIfApiKeyCollectionForbidden(req, res, collectionId)) return;
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
        return void res.json(forms);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

// GET /projects/:projectId/collections/:collectionId/forms/:id
router.get('/:collectionId/forms/:id', async (req: Request, res: Response) => {
    const { projectId, collectionId, id } = req.params;
    if (!projectId || !collectionId || !id)
        return void res.status(400).json({ error: 'Missing path parameters' });
    if (rejectIfApiKeyCollectionForbidden(req, res, collectionId)) return;
    try {
        const collection = await getCollection(projectId, collectionId);
        if (!collection) return void res.status(404).json({ error: 'Collection not found' });
        const formResource = collection.resources.find(r => r.resourceType === 'form');
        if (!formResource)
            return void res.status(404).json({ error: 'Collection does not expose forms' });
        if (formResource.resourceId !== 'forms' && formResource.resourceId !== id)
            return void res.status(404).json({ error: 'Form not found in collection' });
        const form = await getProjectJson<FormSchema>(projectId, formKey(id));
        if (!form) return void res.status(404).json({ error: 'Form not found' });
        return void res.json(form);
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
            tags: ['Collections'],
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
            tags: ['Collections'],
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
            tags: ['Collections'],
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
            tags: ['Collections'],
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
            tags: ['Collections'],
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
            tags: ['Collections'],
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
                }
            ],
            responses: {
                '200': {
                    description: 'Entries',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'array',
                                items: { $ref: '#/components/schemas/Entry' }
                            }
                        }
                    }
                },
                '404': { description: 'Not found', ...jsonErrorBody }
            }
        }
    },
    '/projects/{projectId}/collections/{collectionId}/{resourceId}/entries/{id}': {
        get: {
            summary: 'Get one entry in a collection',
            tags: ['Collections'],
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
                }
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
    '/projects/{projectId}/collections/{collectionId}/pages': {
        get: {
            summary: 'List pages in a collection',
            tags: ['Collections'],
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
            tags: ['Collections'],
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
            tags: ['Collections'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'collectionId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'slug', in: 'path', required: true, schema: { type: 'string' } }
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
            tags: ['Collections'],
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
            tags: ['Collections'],
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
            tags: ['Collections'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'collectionId', in: 'path', required: true, schema: { type: 'string' } }
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
            tags: ['Collections'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'collectionId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
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
    }
};

export default router;
