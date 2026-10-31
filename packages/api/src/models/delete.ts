import type { Request, Response } from 'express';
import { Router } from 'express';
import { requireBuilder } from '../middlewares/auth.js';
import { deleteModelSchema } from '@moteurio/core/models.js';
import type { OpenAPIV3 } from 'openapi-types';
import { sendApiError } from '../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

router.delete('/:modelId', requireBuilder, async (req: Request, res: Response) => {
    const { projectId, modelId } = req.params as Record<string, string>;
    if (!projectId || !modelId) {
        return void res.status(400).json({ error: 'Missing projectId or modelId in path' });
    }

    try {
        await deleteModelSchema(req.user!, projectId, modelId);
        return void res.status(204).send();
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/models/{modelId}': {
        delete: {
            summary: 'Delete a model from a project',
            description:
                'The model goes to the bin with its entries. `POST /projects/{projectId}/bin/{binId}/restore` brings both back. Builders.',
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
                '204': {
                    description: 'Model and its entries in the bin'
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
