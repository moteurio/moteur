import type { Request, Response } from 'express';
import { Router } from 'express';
import { requireProjectAccess } from '../middlewares/auth.js';
import { getModelSchema } from '@moteurio/core/models.js';
import type { OpenAPIV3 } from 'openapi-types';
import { getMessage } from '../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

router.get('/:modelId', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, modelId } = req.params;
    try {
        const model = await getModelSchema(req.user!, projectId, modelId);

        if (!model || !model.id) {
            return void res.status(404).json({ error: 'Model not found' });
        }

        res.json({ model });
    } catch (err: unknown) {
        const msg = getMessage(err) ?? '';
        if (msg.includes('not found')) {
            return void res.status(404).json({ error: 'Model not found' });
        }
        console.error(`Failed to get model ${modelId} for project ${projectId}`, err);
        res.status(500).json({ error: 'Failed to get model' });
    }
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/models/{modelId}': {
        get: {
            summary: 'Get a single model from a project',
            tags: ['Models'],
            parameters: [
                {
                    name: 'projectId',
                    in: 'path',
                    required: true,
                    schema: { type: 'string' }
                },
                {
                    name: 'modelId',
                    in: 'path',
                    required: true,
                    schema: { type: 'string' }
                }
            ],
            responses: {
                '200': {
                    description: 'Returns the model schema',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    model: { $ref: '#/components/schemas/Model' }
                                }
                            }
                        }
                    }
                },
                '404': {
                    description: 'Model not found',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    error: { type: 'string' }
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
