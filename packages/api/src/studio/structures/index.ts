import type { Request, Response } from 'express';
import { Router } from 'express';
import {
    listStructures,
    getStructure,
    createStructure,
    updateStructure,
    deleteStructure
} from '@moteurio/core/structures.js';
import { getBlueprint } from '@moteurio/core/blueprints.js';
import { requireProjectAccess } from '../../middlewares/auth.js';
import type { StructureSchema } from '@moteurio/types/Structure.js';
import type { OpenAPIV3 } from 'openapi-types';
import { sendApiError } from '../../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

router.get('/', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        const registry = await listStructures(projectId);
        const structures = Object.values(registry);
        return void res.json(structures);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.get('/:id', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, id } = req.params;
    if (!projectId || !id) return void res.status(400).json({ error: 'Missing projectId or id' });
    try {
        const structure = await getStructure(id, projectId);
        return void res.json(structure);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.post('/', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        const body = req.body || {};
        let schema: StructureSchema;

        if (body.blueprintId) {
            const blueprint = getBlueprint('structure', body.blueprintId);
            if ((blueprint.kind ?? 'project') !== 'structure') {
                return void res
                    .status(400)
                    .json({ error: 'Blueprint is not a structure blueprint' });
            }
            const template = blueprint.template as { structure: StructureSchema } | undefined;
            if (!template?.structure) {
                return void res.status(400).json({ error: 'Blueprint has no template.structure' });
            }
            const { blueprintId: _b, ...overrides } = body;
            schema = { ...template.structure, ...overrides } as StructureSchema;
        } else {
            schema = body as StructureSchema;
        }

        const structure = await createStructure(projectId, schema, req.user);
        return void res.status(201).json(structure);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.patch('/:id', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, id } = req.params;
    if (!projectId || !id) return void res.status(400).json({ error: 'Missing projectId or id' });
    try {
        const updated = await updateStructure(projectId, id, req.body, req.user);
        return void res.json(updated);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.delete('/:id', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, id } = req.params;
    if (!projectId || !id) return void res.status(400).json({ error: 'Missing projectId or id' });
    try {
        await deleteStructure(projectId, id, req.user);
        return void res.status(204).send();
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

const structJson = {
    content: {
        'application/json': {
            schema: { $ref: '#/components/schemas/JsonRecord' }
        }
    }
};

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/structures': {
        get: {
            summary: 'List structures',
            tags: ['Structures'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'List of structures',
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
            summary: 'Create structure',
            tags: ['Structures'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                blueprintId: { type: 'string' },
                                id: { type: 'string' },
                                label: { type: 'string' },
                                handle: { type: 'string' }
                            }
                        }
                    }
                }
            },
            responses: {
                '201': {
                    description: 'Structure created',
                    ...structJson
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
    '/projects/{projectId}/structures/{id}': {
        get: {
            summary: 'Get structure by id',
            tags: ['Structures'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Structure',
                    ...structJson
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
            summary: 'Update structure',
            tags: ['Structures'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
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
                    description: 'Structure updated',
                    ...structJson
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
            summary: 'Delete structure',
            tags: ['Structures'],
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
