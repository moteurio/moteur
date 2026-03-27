import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import { getReviews, getReview, approveReview, rejectReview } from '@moteurio/core/reviews.js';
import { OPERATOR_ROLE_SLUG } from '@moteurio/types';
import { requireProjectAccess } from '../../middlewares/auth.js';
import { getMessage } from '../../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

type ReviewsParams = { projectId: string; reviewId?: string };
type ReviewByIdParams = { projectId: string; reviewId: string };
type ReviewsQuery = {
    modelId?: string;
    entryId?: string;
    status?: 'pending' | 'approved' | 'rejected';
};
type RejectBody = { reason?: string };

router.get(
    '/',
    requireProjectAccess,
    async (req: Request<ReviewsParams, unknown, unknown, ReviewsQuery>, res: Response) => {
        const { projectId } = req.params;
        const { modelId, entryId, status } = req.query;
        try {
            const reviews = await getReviews(projectId, {
                ...(modelId && { modelId }),
                ...(entryId && { entryId }),
                ...(status && { status })
            });
            return void res.json({ reviews });
        } catch {
            return void res.status(500).json({ error: 'Failed to list reviews' });
        }
    }
);

router.get(
    '/:reviewId',
    requireProjectAccess,
    async (req: Request<ReviewByIdParams>, res: Response) => {
        const { projectId, reviewId } = req.params;
        try {
            const review = await getReview(projectId, reviewId);
            if (!review) return void res.status(404).json({ error: 'Review not found' });
            return void res.json({ review });
        } catch {
            return void res.status(500).json({ error: 'Failed to get review' });
        }
    }
);

router.post(
    '/:reviewId/approve',
    requireProjectAccess,
    async (req: Request<ReviewByIdParams>, res: Response) => {
        const { projectId, reviewId } = req.params;
        try {
            const review = await approveReview(projectId, req.user!, reviewId);
            return void res.json({ review });
        } catch (err: unknown) {
            const status =
                getMessage(err)?.includes('reviewer') ||
                getMessage(err)?.includes(OPERATOR_ROLE_SLUG)
                    ? 403
                    : getMessage(err)?.includes('not found') ||
                        getMessage(err)?.includes('not pending')
                      ? 400
                      : 500;
            return void res
                .status(status)
                .json({ error: getMessage(err) ?? 'Failed to approve review' });
        }
    }
);

router.post(
    '/:reviewId/reject',
    requireProjectAccess,
    async (req: Request<ReviewByIdParams, unknown, RejectBody>, res: Response) => {
        const { projectId, reviewId } = req.params;
        const reason = req.body?.reason;
        try {
            const review = await rejectReview(
                projectId,
                req.user!,
                reviewId,
                typeof reason === 'string' ? reason : 'Rejected without comment.'
            );
            return void res.json({ review });
        } catch (err: unknown) {
            const status =
                getMessage(err)?.includes('reviewer') ||
                getMessage(err)?.includes(OPERATOR_ROLE_SLUG)
                    ? 403
                    : getMessage(err)?.includes('not found') ||
                        getMessage(err)?.includes('not pending')
                      ? 400
                      : 500;
            return void res
                .status(status)
                .json({ error: getMessage(err) ?? 'Failed to reject review' });
        }
    }
);

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/reviews': {
        get: {
            summary: 'List reviews',
            tags: ['Reviews'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'modelId', in: 'query', schema: { type: 'string' } },
                { name: 'entryId', in: 'query', schema: { type: 'string' } },
                {
                    name: 'status',
                    in: 'query',
                    schema: { type: 'string', enum: ['pending', 'approved', 'rejected'] }
                }
            ],
            responses: {
                '200': {
                    description: 'List of reviews',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    reviews: { type: 'array', items: { type: 'object' } }
                                }
                            }
                        }
                    }
                }
            }
        }
    },
    '/projects/{projectId}/reviews/{reviewId}': {
        get: {
            summary: 'Get a review',
            tags: ['Reviews'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'reviewId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Review',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: { review: { type: 'object' } }
                            }
                        }
                    }
                },
                '404': { description: 'Review not found' }
            }
        }
    },
    '/projects/{projectId}/reviews/{reviewId}/approve': {
        post: {
            summary: 'Approve a review (reviewer or operator only)',
            tags: ['Reviews'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'reviewId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Approved review',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: { review: { type: 'object' } }
                            }
                        }
                    }
                },
                '403': { description: 'Reviewer or operator role required' },
                '400': { description: 'Review not found or not pending' }
            }
        }
    },
    '/projects/{projectId}/reviews/{reviewId}/reject': {
        post: {
            summary: 'Reject a review (reviewer or operator only); reason becomes a Comment',
            tags: ['Reviews'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'reviewId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: { reason: { type: 'string' } }
                        }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Rejected review',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: { review: { type: 'object' } }
                            }
                        }
                    }
                },
                '403': { description: 'Reviewer or operator role required' },
                '400': { description: 'Review not found or not pending' }
            }
        }
    }
};

export default router;
