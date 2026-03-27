import type { Request, Response } from 'express';
import { Router } from 'express';
import { requireOperator } from '../middlewares/auth.js';
import {
    listBlueprints,
    getBlueprint,
    createBlueprint,
    updateBlueprint,
    deleteBlueprint
} from '@moteurio/core/blueprints.js';
import type { BlueprintKind, BlueprintSchema } from '@moteurio/types/Blueprint.js';
import type { OpenAPIV3 } from 'openapi-types';
import { sendApiError, getMessage } from '../utils/apiError.js';

function createKindRouter(kind: BlueprintKind): Router {
    const router = Router({ mergeParams: true });

    /** List all blueprints of this kind */
    router.get('/', requireOperator, (req: Request, res: Response) => {
        try {
            const blueprints = listBlueprints(kind);
            return void res.json({ blueprints });
        } catch (err: unknown) {
            return void sendApiError(res, req, err);
        }
    });

    /** Get one blueprint by id */
    router.get('/:blueprintId', requireOperator, (req: Request, res: Response) => {
        try {
            const blueprint = getBlueprint(kind, req.params.blueprintId);
            return void res.json(blueprint);
        } catch (err: unknown) {
            const msg = getMessage(err);
            if (msg.toLowerCase().includes('not found')) {
                return void res.status(404).json({ error: msg, requestId: req.requestId });
            }
            return void res.status(400).json({ error: msg, requestId: req.requestId });
        }
    });

    /** Create or replace a blueprint */
    router.post('/', requireOperator, (req: Request, res: Response) => {
        try {
            const body = req.body as BlueprintSchema;
            if (!body?.id) {
                return void res.status(400).json({ error: 'Blueprint "id" is required' });
            }
            const blueprint = createBlueprint({ ...body, kind }, req.user);
            return void res.status(201).json(blueprint);
        } catch (err: unknown) {
            return void sendApiError(res, req, err);
        }
    });

    /** Update a blueprint (partial) */
    router.patch('/:blueprintId', requireOperator, (req: Request, res: Response) => {
        try {
            const { blueprintId } = req.params;
            const blueprint = updateBlueprint(kind, blueprintId, req.body, req.user);
            return void res.json(blueprint);
        } catch (err: unknown) {
            const msg = getMessage(err);
            if (msg.toLowerCase().includes('not found')) {
                return void res.status(404).json({ error: msg, requestId: req.requestId });
            }
            return void res.status(400).json({ error: msg, requestId: req.requestId });
        }
    });

    /** Delete a blueprint */
    router.delete('/:blueprintId', requireOperator, (req: Request, res: Response) => {
        try {
            deleteBlueprint(kind, req.params.blueprintId, req.user);
            return void res.status(204).send();
        } catch (err: unknown) {
            return void sendApiError(res, req, err);
        }
    });

    return router;
}

const router: Router = Router();
router.use('/projects', createKindRouter('project'));
router.use('/models', createKindRouter('model'));
router.use('/structures', createKindRouter('structure'));
router.use('/templates', createKindRouter('template'));

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/blueprints/projects': {
        get: {
            summary: 'List project blueprints',
            tags: ['Blueprints'],
            responses: {
                '200': {
                    description: 'List of project blueprints',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    blueprints: {
                                        type: 'array',
                                        items: { $ref: '#/components/schemas/Blueprint' }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        post: {
            summary: 'Create a project blueprint',
            tags: ['Blueprints'],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/Blueprint' }
                    }
                }
            },
            responses: {
                '201': {
                    description: 'Blueprint created',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/Blueprint' }
                        }
                    }
                },
                '400': { description: 'Validation error' }
            }
        }
    },
    '/blueprints/projects/{blueprintId}': {
        get: {
            summary: 'Get a project blueprint by id',
            tags: ['Blueprints'],
            parameters: [
                { name: 'blueprintId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Blueprint',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/Blueprint' }
                        }
                    }
                },
                '404': { description: 'Blueprint not found' }
            }
        },
        patch: {
            summary: 'Update a project blueprint',
            tags: ['Blueprints'],
            parameters: [
                { name: 'blueprintId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                name: { type: 'string' },
                                description: { type: 'string' },
                                template: { $ref: '#/components/schemas/BlueprintTemplate' }
                            }
                        }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Updated blueprint',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/Blueprint' }
                        }
                    }
                },
                '404': { description: 'Blueprint not found' }
            }
        },
        delete: {
            summary: 'Delete a project blueprint',
            tags: ['Blueprints'],
            parameters: [
                { name: 'blueprintId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '204': { description: 'Blueprint deleted' },
                '400': { description: 'Invalid id' }
            }
        }
    },
    '/blueprints/models': {
        get: {
            summary: 'List model blueprints',
            tags: ['Blueprints'],
            responses: {
                '200': {
                    description: 'List of model blueprints',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    blueprints: {
                                        type: 'array',
                                        items: { $ref: '#/components/schemas/Blueprint' }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        post: {
            summary: 'Create a model blueprint',
            tags: ['Blueprints'],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/Blueprint' }
                    }
                }
            },
            responses: {
                '201': {
                    description: 'Blueprint created',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/Blueprint' }
                        }
                    }
                },
                '400': { description: 'Validation error' }
            }
        }
    },
    '/blueprints/models/{blueprintId}': {
        get: {
            summary: 'Get a model blueprint by id',
            tags: ['Blueprints'],
            parameters: [
                { name: 'blueprintId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Blueprint',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/Blueprint' }
                        }
                    }
                },
                '404': { description: 'Blueprint not found' }
            }
        },
        patch: {
            summary: 'Update a model blueprint',
            tags: ['Blueprints'],
            parameters: [
                { name: 'blueprintId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                name: { type: 'string' },
                                description: { type: 'string' },
                                template: { $ref: '#/components/schemas/BlueprintTemplate' }
                            }
                        }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Updated blueprint',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/Blueprint' }
                        }
                    }
                },
                '404': { description: 'Blueprint not found' }
            }
        },
        delete: {
            summary: 'Delete a model blueprint',
            tags: ['Blueprints'],
            parameters: [
                { name: 'blueprintId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '204': { description: 'Blueprint deleted' },
                '400': { description: 'Invalid id' }
            }
        }
    },
    '/blueprints/structures': {
        get: {
            summary: 'List structure blueprints',
            tags: ['Blueprints'],
            responses: {
                '200': {
                    description: 'List of structure blueprints',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    blueprints: {
                                        type: 'array',
                                        items: { $ref: '#/components/schemas/Blueprint' }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        post: {
            summary: 'Create a structure blueprint',
            tags: ['Blueprints'],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/Blueprint' }
                    }
                }
            },
            responses: {
                '201': {
                    description: 'Blueprint created',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/Blueprint' }
                        }
                    }
                },
                '400': { description: 'Validation error' }
            }
        }
    },
    '/blueprints/structures/{blueprintId}': {
        get: {
            summary: 'Get a structure blueprint by id',
            tags: ['Blueprints'],
            parameters: [
                { name: 'blueprintId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Blueprint',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/Blueprint' }
                        }
                    }
                },
                '404': { description: 'Blueprint not found' }
            }
        },
        patch: {
            summary: 'Update a structure blueprint',
            tags: ['Blueprints'],
            parameters: [
                { name: 'blueprintId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                name: { type: 'string' },
                                description: { type: 'string' },
                                template: { $ref: '#/components/schemas/BlueprintTemplate' }
                            }
                        }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Updated blueprint',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/Blueprint' }
                        }
                    }
                },
                '404': { description: 'Blueprint not found' }
            }
        },
        delete: {
            summary: 'Delete a structure blueprint',
            tags: ['Blueprints'],
            parameters: [
                { name: 'blueprintId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '204': { description: 'Blueprint deleted' },
                '400': { description: 'Invalid id' }
            }
        }
    },
    '/blueprints/templates': {
        get: {
            summary: 'List template blueprints',
            tags: ['Blueprints'],
            responses: {
                '200': {
                    description: 'List of template blueprints',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    blueprints: {
                                        type: 'array',
                                        items: { $ref: '#/components/schemas/Blueprint' }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        post: {
            summary: 'Create a template blueprint',
            tags: ['Blueprints'],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/Blueprint' }
                    }
                }
            },
            responses: {
                '201': {
                    description: 'Blueprint created',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/Blueprint' }
                        }
                    }
                },
                '400': { description: 'Validation error' }
            }
        }
    },
    '/blueprints/templates/{blueprintId}': {
        get: {
            summary: 'Get a template blueprint by id',
            tags: ['Blueprints'],
            parameters: [
                { name: 'blueprintId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Blueprint',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/Blueprint' }
                        }
                    }
                },
                '404': { description: 'Blueprint not found' }
            }
        },
        patch: {
            summary: 'Update a template blueprint',
            tags: ['Blueprints'],
            parameters: [
                { name: 'blueprintId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                name: { type: 'string' },
                                description: { type: 'string' },
                                template: { $ref: '#/components/schemas/BlueprintTemplate' }
                            }
                        }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Updated blueprint',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/Blueprint' }
                        }
                    }
                },
                '404': { description: 'Blueprint not found' }
            }
        },
        delete: {
            summary: 'Delete a template blueprint',
            tags: ['Blueprints'],
            parameters: [
                { name: 'blueprintId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '204': { description: 'Blueprint deleted' },
                '400': { description: 'Invalid id' }
            }
        }
    }
};

export const schemas: OpenAPIV3.ComponentsObject['schemas'] = {
    Blueprint: {
        type: 'object',
        required: ['id', 'name'],
        properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            kind: {
                type: 'string',
                enum: ['project', 'model', 'structure', 'template'],
                description: 'Blueprint kind; set by route for create.'
            },
            template: { $ref: '#/components/schemas/BlueprintTemplate' }
        }
    },
    BlueprintTemplate: {
        type: 'object',
        properties: {
            models: {
                type: 'array',
                items: { $ref: '#/components/schemas/Model' }
            },
            layouts: {
                type: 'array',
                items: { type: 'object' }
            },
            structures: {
                type: 'array',
                items: { type: 'object' }
            },
            model: { $ref: '#/components/schemas/Model' },
            structure: { type: 'object' },
            template: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    label: { type: 'string' },
                    description: { type: 'string' },
                    fields: { type: 'object', additionalProperties: true }
                }
            }
        }
    }
};

export default router;
