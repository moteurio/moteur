import type { Request, Response } from 'express';
import { Router } from 'express';
import {
    listLayouts,
    getLayout,
    createLayout,
    updateLayout,
    deleteLayout
} from '@moteurio/core/layouts.js';
import { requireProjectAccess } from '../../middlewares/auth.js';
import type { OpenAPIV3 } from 'openapi-types';
import { sendApiError } from '../../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

router.get('/', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        const layouts = await listLayouts(req.user!, projectId);
        return void res.json(layouts);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.get('/:layoutId', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, layoutId } = req.params;
    if (!projectId || !layoutId)
        return void res.status(400).json({ error: 'Missing projectId or layoutId' });
    try {
        const layout = await getLayout(req.user!, projectId, layoutId);
        return void res.json(layout);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.post('/', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        const layout = await createLayout(req.user!, projectId, req.body);
        return void res.status(201).json(layout);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.patch('/:layoutId', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, layoutId } = req.params;
    if (!projectId || !layoutId)
        return void res.status(400).json({ error: 'Missing projectId or layoutId' });
    try {
        const updated = await updateLayout(req.user!, projectId, layoutId, req.body);
        return void res.json(updated);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.delete('/:layoutId', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, layoutId } = req.params;
    if (!projectId || !layoutId)
        return void res.status(400).json({ error: 'Missing projectId or layoutId' });
    try {
        await deleteLayout(req.user!, projectId, layoutId);
        return void res.status(204).send();
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

const layoutJson = {
    content: {
        'application/json': {
            schema: { $ref: '#/components/schemas/JsonRecord' }
        }
    }
};

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/layouts': {
        get: {
            summary: 'List layouts',
            tags: ['Layouts'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'List of layouts',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'array',
                                items: { $ref: '#/components/schemas/JsonRecord' }
                            }
                        }
                    }
                }
            }
        },
        post: {
            summary: 'Create layout',
            tags: ['Layouts'],
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
                    description: 'Layout created',
                    ...layoutJson
                },
                '400': {
                    description: 'Bad request',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                }
            }
        }
    },
    '/projects/{projectId}/layouts/{layoutId}': {
        get: {
            summary: 'Get layout by id',
            tags: ['Layouts'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'layoutId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Layout',
                    ...layoutJson
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
        },
        patch: {
            summary: 'Update layout',
            tags: ['Layouts'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'layoutId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/JsonRecord' }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Layout updated',
                    ...layoutJson
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
        },
        delete: {
            summary: 'Delete layout',
            tags: ['Layouts'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'layoutId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '204': { description: 'Deleted' },
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
    }
};

export default router;
