import type { Request, Response } from 'express';
import { Router } from 'express';
import { listModelSchemas } from '@moteurio/core/models.js';
import { requireProjectAccess } from '../middlewares/auth.js';
import type { OpenAPIV3 } from 'openapi-types';

const router: Router = Router({ mergeParams: true });

router.get('/', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params;
    if (!projectId) {
        return void res.status(400).json({ error: 'Missing projectId in path' });
    }

    try {
        const models = await listModelSchemas(req.user!, projectId);
        return void res.json({ models: models });
    } catch (err) {
        console.error(`Failed to load models for project ${projectId}`, err);
        return void res.status(500).json({ error: 'Failed to load models' });
    }
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/models': {
        get: {
            summary: 'List models in a project',
            tags: ['Models'],
            parameters: [
                {
                    name: 'projectId',
                    in: 'path',
                    required: true,
                    schema: { type: 'string' }
                }
            ],
            responses: {
                '200': {
                    description: 'List of models in the given project',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    models: {
                                        type: 'array',
                                        items: { $ref: '#/components/schemas/Model' }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
};

export default router;
