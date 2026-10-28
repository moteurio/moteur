import type { Request, Response } from 'express';
import { Router } from 'express';
import {
    listPages,
    getPageWithAuth,
    getPageBySlug,
    createPage,
    updatePage,
    deletePage,
    reorderPages,
    validatePageById,
    validateAllPages
} from '@moteurio/core/pages.js';
import { getTemplate } from '@moteurio/core/templates.js';
import { pageReferrers } from '@moteurio/core/contentReferences.js';
import { resolvePageAssets } from '@moteurio/core/assets/assetResolver.js';
import { submitForPageReview } from '@moteurio/core/reviews.js';
import { withWaitingChanges } from '@moteurio/core/pages/publishedPages.js';
import { PlanLimitError } from '@moteurio/core/planLimits.js';
import type { PageNode } from '@moteurio/types/Page.js';
import { requireProjectAccess } from '../../middlewares/auth.js';
import { queryFlag } from '../../utils/queryFlag.js';
import type { OpenAPIV3 } from 'openapi-types';
import {
    sendApiError,
    getMessage,
    getHttpStatusForError,
    errorFields
} from '../../utils/apiError.js';
import { mergePathSpecs } from '../../utils/mergePathSpecs.js';
import { revisionsOpenapi, revisionsRouter } from './revisions.js';

const router: Router = Router({ mergeParams: true });

router.use(revisionsRouter);

const VALID_PAGE_STATUSES = ['draft', 'published'] as const;

/** One page as members get it: a live page with edits waiting says so. */
const one = async (projectId: string, page: PageNode) =>
    (await withWaitingChanges(projectId, [page]))[0]!;

router.get('/', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    const templateId = req.query.templateId as string | undefined;
    const parentId = req.query.parentId as string | undefined;
    const status = req.query.status as string | undefined;
    const type = req.query.type as PageNode['type'] | undefined;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        const pages = await listPages(projectId, {
            templateId,
            parentId: parentId === '' || parentId === 'null' ? null : parentId,
            status: status as 'draft' | 'published' | undefined,
            type
        });
        return void res.json(await withWaitingChanges(projectId, pages));
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.get('/by-slug/:slug', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, slug } = req.params as Record<string, string>;
    if (!projectId || !slug)
        return void res.status(400).json({ error: 'Missing projectId or slug' });
    try {
        const locale = typeof req.query.locale === 'string' ? req.query.locale : undefined;
        const page = await getPageBySlug(projectId, slug, locale);
        if (!page) return void res.status(404).json({ error: 'Page not found' });
        return void res.json(await one(projectId, page));
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.get('/:id', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, id } = req.params as Record<string, string>;
    if (!projectId || !id) return void res.status(400).json({ error: 'Missing projectId or id' });
    try {
        const page = await getPageWithAuth(req.user!, projectId, id);
        let out = page;
        if (queryFlag(req.query.resolveAssets) && 'templateId' in page) {
            const template = await getTemplate(projectId, page.templateId);
            out = await resolvePageAssets(projectId, page, template);
        }
        return void res.json(await one(projectId, out));
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

/** What links to the page or relates to it: entries and other pages (shown before deleting it). */
router.get('/:id/referrers', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, id } = req.params as Record<string, string>;
    if (!projectId || !id) return void res.status(400).json({ error: 'Missing projectId or id' });
    try {
        await getPageWithAuth(req.user!, projectId, id);
        return void res.json({ referrers: await pageReferrers(projectId, id) });
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.post('/', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    const body = req.body || {};
    if (!body.type) {
        return void res.status(400).json({
            error: 'Page type is required (e.g. static, collection, folder).'
        });
    }
    try {
        const data = { ...body, projectId };
        const page = await createPage(projectId, req.user!, data);
        return void res.status(201).json(page);
    } catch (err: unknown) {
        if (err instanceof PlanLimitError) return void sendApiError(res, req, err);
        const code = getMessage(err)?.includes('slug')
            ? 409
            : getMessage(err)?.includes('validation')
              ? 422
              : getMessage(err)?.includes('not found')
                ? 404
                : 422;
        return void res
            .status(code)
            .json({ error: getMessage(err) ?? 'Failed to create page', ...errorFields(err) });
    }
});

router.post('/reorder', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    const updates = req.body;
    if (!Array.isArray(updates))
        return void res
            .status(400)
            .json({ error: 'Body must be an array of { id, parentId, order }' });
    try {
        const pages = await reorderPages(projectId, req.user!, updates);
        return void res.json(pages);
    } catch (err: unknown) {
        const code = getMessage(err)?.includes('cycle')
            ? 422
            : getMessage(err)?.includes('not found')
              ? 404
              : 400;
        return void res.status(code).json({ error: getMessage(err) ?? 'Failed to reorder' });
    }
});

router.put('/:id', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, id } = req.params as Record<string, string>;
    if (!projectId || !id) return void res.status(400).json({ error: 'Missing projectId or id' });
    try {
        const page = await updatePage(projectId, req.user!, id, req.body);
        return void res.json(await one(projectId, page));
    } catch (err: unknown) {
        const code =
            (err as { statusCode?: number }).statusCode === 403 ||
            getMessage(err)?.includes('Publishing requires')
                ? 403
                : getMessage(err)?.includes('not found')
                  ? 404
                  : 400;
        return void res
            .status(code)
            .json({ error: getMessage(err) ?? 'Failed to update page', ...errorFields(err) });
    }
});

router.patch('/:id', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, id } = req.params as Record<string, string>;
    if (!projectId || !id) return void res.status(400).json({ error: 'Missing projectId or id' });
    try {
        const page = await updatePage(projectId, req.user!, id, req.body);
        return void res.json(await one(projectId, page));
    } catch (err: unknown) {
        const code =
            (err as { statusCode?: number }).statusCode === 403 ||
            getMessage(err)?.includes('Publishing requires')
                ? 403
                : getMessage(err)?.includes('not found')
                  ? 404
                  : 400;
        return void res
            .status(code)
            .json({ error: getMessage(err) ?? 'Failed to patch page', ...errorFields(err) });
    }
});

router.delete('/:id', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, id } = req.params as Record<string, string>;
    if (!projectId || !id) return void res.status(400).json({ error: 'Missing projectId or id' });
    try {
        await deletePage(projectId, req.user!, id);
        return void res.status(204).send();
    } catch (err: unknown) {
        if (getHttpStatusForError(err) === 409)
            return void res.status(409).json({ error: getMessage(err) || 'Page has children' });
        return void res.status(404).json({ error: getMessage(err) || 'Page not found' });
    }
});

router.patch('/:id/status', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, id } = req.params as Record<string, string>;
    const status = req.body?.status as string | undefined;
    if (!projectId || !id) return void res.status(400).json({ error: 'Missing projectId or id' });
    if (!status || !VALID_PAGE_STATUSES.includes(status as 'draft' | 'published')) {
        return void res
            .status(400)
            .json({ error: `status must be one of: ${VALID_PAGE_STATUSES.join(', ')}` });
    }
    try {
        const page = await updatePage(projectId, req.user!, id, {
            status: status as 'draft' | 'published'
        });
        return void res.json(await one(projectId, page));
    } catch (err: unknown) {
        const code = getMessage(err)?.includes('requires an approved review')
            ? 403
            : getMessage(err)?.includes('not found')
              ? 404
              : 400;
        return void res.status(code).json({
            error: getMessage(err) ?? 'Failed to update page status',
            ...errorFields(err)
        });
    }
});

router.post('/:id/submit-review', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, id } = req.params as Record<string, string>;
    const assignedTo = req.body?.assignedTo as string | undefined;
    if (!projectId || !id) return void res.status(400).json({ error: 'Missing projectId or id' });
    try {
        const review = await submitForPageReview(projectId, req.user!, id, assignedTo);
        return void res.status(201).json(review);
    } catch (err: unknown) {
        const code =
            getMessage(err)?.includes('not enabled') ||
            getMessage(err)?.includes('already has a pending')
                ? 400
                : getMessage(err)?.includes('not found')
                  ? 404
                  : 403;
        return void res
            .status(code)
            .json({ error: getMessage(err) ?? 'Failed to submit for review' });
    }
});

router.post('/validate-all', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        const results = await validateAllPages(projectId);
        return void res.json(results);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.post('/:id/validate', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, id } = req.params as Record<string, string>;
    if (!projectId || !id) return void res.status(400).json({ error: 'Missing projectId or id' });
    try {
        const result = await validatePageById(projectId, id);
        return void res.json(result);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

const pageNodeJson = {
    content: {
        'application/json': {
            schema: { $ref: '#/components/schemas/CollectionPageNode' }
        }
    }
};

const pageListJson = {
    content: {
        'application/json': {
            schema: {
                type: 'array' as const,
                items: { $ref: '#/components/schemas/CollectionPageNode' }
            }
        }
    }
};

const pagePaths: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/pages': {
        get: {
            summary: 'List pages',
            tags: ['Pages'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'templateId', in: 'query', schema: { type: 'string' } },
                { name: 'parentId', in: 'query', schema: { type: 'string' } },
                {
                    name: 'status',
                    in: 'query',
                    schema: { type: 'string', enum: [...VALID_PAGE_STATUSES] }
                },
                {
                    name: 'type',
                    in: 'query',
                    schema: { type: 'string', enum: ['static', 'collection', 'folder'] }
                }
            ],
            responses: {
                '200': {
                    description: 'List of pages',
                    ...pageListJson
                }
            }
        },
        post: {
            summary: 'Create page',
            tags: ['Pages'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/JsonRecord' }
                    }
                }
            },
            responses: {
                '201': {
                    description: 'Page created',
                    ...pageNodeJson
                }
            }
        }
    },
    '/projects/{projectId}/pages/validate-all': {
        post: {
            summary: 'Validate all pages',
            tags: ['Pages'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Validation results (same order as internal page list)',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'array',
                                items: { $ref: '#/components/schemas/PageValidationResult' }
                            }
                        }
                    }
                }
            }
        }
    },
    '/projects/{projectId}/pages/by-slug/{slug}': {
        get: {
            summary: 'Get page by slug',
            tags: ['Pages'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'slug', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Page',
                    ...pageNodeJson
                },
                '404': {
                    description: 'Not found',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                }
            }
        }
    },
    '/projects/{projectId}/pages/{id}': {
        get: {
            summary: 'Get page',
            tags: ['Pages'],
            responses: {
                '200': {
                    description: 'Page',
                    ...pageNodeJson
                }
            }
        },
        put: {
            summary: 'Replace page',
            tags: ['Pages'],
            requestBody: {
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/JsonRecord' }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Page updated',
                    ...pageNodeJson
                }
            }
        },
        patch: {
            summary: 'Patch page',
            tags: ['Pages'],
            requestBody: {
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/JsonRecord' }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Page updated',
                    ...pageNodeJson
                }
            }
        },
        delete: {
            summary: 'Delete page',
            tags: ['Pages'],
            responses: {
                '204': { description: 'Deleted' },
                '409': {
                    description: 'Page has children; move or delete children first',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                }
            }
        }
    },
    '/projects/{projectId}/pages/{id}/referrers': {
        get: {
            summary: 'What links to a page',
            description:
                'The entries and other pages that link to this page (a link with a pageId) or relate to it (a relation to pages), at any depth of their fields. Deleting the page leaves those links marked missing.',
            tags: ['Pages'],
            responses: {
                '200': {
                    description: 'Each place that points at the page',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    referrers: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            required: ['from', 'path', 'via', 'to'],
                                            properties: {
                                                from: {
                                                    type: 'object',
                                                    required: ['kind', 'id'],
                                                    properties: {
                                                        kind: {
                                                            type: 'string',
                                                            enum: ['entry', 'page']
                                                        },
                                                        id: { type: 'string' },
                                                        modelId: { type: 'string' },
                                                        label: { type: 'string' }
                                                    }
                                                },
                                                path: {
                                                    type: 'string',
                                                    example: 'body[2].data.cta'
                                                },
                                                via: { type: 'string', enum: ['link', 'relation'] },
                                                to: { type: 'object' }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                '404': { description: 'Page not found' }
            }
        }
    },
    '/projects/{projectId}/pages/{id}/status': {
        patch: {
            summary: 'Update page status',
            tags: ['Pages'],
            requestBody: {
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            required: ['status'],
                            properties: {
                                status: { type: 'string', enum: [...VALID_PAGE_STATUSES] }
                            }
                        }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Page updated',
                    ...pageNodeJson
                },
                '403': {
                    description: 'Publish requires approved review',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                }
            }
        }
    },
    '/projects/{projectId}/pages/{id}/submit-review': {
        post: {
            summary: 'Submit page for review',
            tags: ['Pages'],
            responses: {
                '201': {
                    description: 'Review created',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/Review' }
                        }
                    }
                }
            }
        }
    },
    '/projects/{projectId}/pages/{id}/validate': {
        post: {
            summary: 'Validate page',
            tags: ['Pages'],
            responses: {
                '200': {
                    description: 'Validation result',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/PageValidationResult' }
                        }
                    }
                }
            }
        }
    },
    '/projects/{projectId}/pages/reorder': {
        post: {
            summary: 'Reorder pages (batch parentId + order)',
            tags: ['Pages'],
            requestBody: {
                content: {
                    'application/json': {
                        schema: {
                            type: 'array',
                            items: {
                                type: 'object',
                                required: ['id', 'parentId', 'order'],
                                properties: {
                                    id: { type: 'string' },
                                    parentId: { type: 'string', nullable: true },
                                    order: { type: 'number' }
                                }
                            }
                        }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Updated page nodes',
                    ...pageListJson
                }
            }
        }
    }
};

export const openapi = mergePathSpecs(revisionsOpenapi, pagePaths);

export default router;
