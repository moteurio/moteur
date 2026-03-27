import type { Request, Response } from 'express';
import { Router } from 'express';
import {
    listNavigations,
    getNavigation,
    getNavigationByHandle,
    resolveNavigation,
    createNavigation,
    updateNavigation,
    deleteNavigation
} from '@moteurio/core/navigations.js';
import { optionalProjectAccess, requireProjectAccess } from '../../middlewares/auth.js';
import type { OpenAPIV3 } from 'openapi-types';
import { sendApiError, getMessage } from '../../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

router.get('/', optionalProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        const list = await listNavigations(projectId);
        const out = req.user
            ? list
            : await Promise.all(list.map((nav: any) => resolveNavigation(projectId, nav)));
        return void res.json(out);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.post('/', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        const nav = await createNavigation(projectId, req.user!, req.body);
        return void res.status(201).json(nav);
    } catch (err: unknown) {
        const code = getMessage(err)?.includes('already exists')
            ? 409
            : getMessage(err)?.includes('exceed max depth') ||
                getMessage(err)?.includes('not found') ||
                getMessage(err)?.includes('Handle must')
              ? 422
              : 400;
        return void res
            .status(code)
            .json({ error: getMessage(err) ?? 'Failed to create navigation' });
    }
});

router.get('/:id', optionalProjectAccess, async (req: Request, res: Response) => {
    const { projectId, id } = req.params;
    if (!projectId || !id) return void res.status(400).json({ error: 'Missing projectId or id' });
    try {
        const nav = req.user
            ? await getNavigation(projectId, id)
            : await getNavigationByHandle(projectId, id);
        if (!nav) return void res.status(404).json({ error: 'Navigation not found' });
        const out = req.user ? nav : await resolveNavigation(projectId, nav);
        return void res.json(out);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.patch('/:id', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, id } = req.params;
    if (!projectId || !id) return void res.status(400).json({ error: 'Missing projectId or id' });
    try {
        const nav = await updateNavigation(projectId, req.user!, id, req.body);
        return void res.json(nav);
    } catch (err: unknown) {
        const code =
            getMessage(err)?.includes('maxDepth') ||
            getMessage(err)?.includes('existing items have depth')
                ? 422
                : getMessage(err)?.includes('already exists')
                  ? 409
                  : getMessage(err)?.includes('not found')
                    ? 404
                    : 400;
        return void res
            .status(code)
            .json({ error: getMessage(err) ?? 'Failed to update navigation' });
    }
});

router.delete('/:id', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, id } = req.params;
    if (!projectId || !id) return void res.status(400).json({ error: 'Missing projectId or id' });
    try {
        await deleteNavigation(projectId, req.user!, id);
        return void res.status(204).send();
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

const navJson = {
    content: {
        'application/json': {
            schema: { $ref: '#/components/schemas/JsonRecord' }
        }
    }
};

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/navigations': {
        get: {
            summary: 'List navigations',
            tags: ['Navigations'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Navigations',
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
            summary: 'Create navigation',
            tags: ['Navigations'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                name: { type: 'string' },
                                handle: { type: 'string' },
                                maxDepth: { type: 'number' },
                                itemSchema: { type: 'array', items: {} },
                                items: { type: 'array', items: {} }
                            },
                            required: ['name', 'handle']
                        }
                    }
                }
            },
            responses: {
                '201': {
                    description: 'Navigation',
                    ...navJson
                },
                '409': {
                    description: 'Handle conflict',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                },
                '422': {
                    description: 'Validation failed',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                }
            }
        }
    },
    '/projects/{projectId}/navigations/{id}': {
        get: {
            summary: 'Get navigation by id or handle',
            tags: ['Navigations'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Navigation',
                    ...navJson
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
            summary: 'Update navigation',
            tags: ['Navigations'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Navigation',
                    ...navJson
                },
                '404': {
                    description: 'Not found',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                },
                '422': {
                    description: 'maxDepth conflict',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                }
            }
        },
        delete: {
            summary: 'Delete navigation',
            tags: ['Navigations'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
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
