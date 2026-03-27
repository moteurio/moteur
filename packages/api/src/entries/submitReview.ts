import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import { submitForReview } from '@moteurio/core/reviews.js';
import { requireProjectAccess } from '../middlewares/auth.js';
import { getMessage } from '../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

router.post(
    '/:entryId/submit-review',
    requireProjectAccess,
    async (req: Request, res: Response) => {
        const { projectId, modelId, entryId } = req.params;
        if (!projectId || !modelId || !entryId) {
            return void res.status(400).json({ error: 'Missing path parameters' });
        }
        const assignedTo = req.body?.assignedTo as string | undefined;
        try {
            const review = await submitForReview(
                projectId,
                req.user!,
                modelId,
                entryId,
                assignedTo
            );
            return void res.status(201).json(review);
        } catch (err: unknown) {
            const status =
                getMessage(err)?.includes('not enabled') ||
                getMessage(err)?.includes('already has a pending')
                    ? 400
                    : getMessage(err)?.includes('not found')
                      ? 404
                      : 403;
            return void res
                .status(status)
                .json({ error: getMessage(err) ?? 'Failed to submit for review' });
        }
    }
);

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/models/{modelId}/entries/{entryId}/submit-review': {
        post: {
            summary: 'Submit an entry for review',
            tags: ['Reviews'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'modelId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'entryId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                assignedTo: {
                                    type: 'string',
                                    description: 'User ID of assigned reviewer'
                                }
                            }
                        }
                    }
                }
            },
            responses: {
                '201': {
                    description: 'Review created',
                    content: {
                        'application/json': { schema: { $ref: '#/components/schemas/Review' } }
                    }
                },
                '400': {
                    description: 'Workflow not enabled or already pending',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                },
                '404': {
                    description: 'Entry not found',
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
