import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import { getReviews, getReview, approveReview, rejectReview } from '@moteurio/core/reviews.js';
import { requireProjectAccess } from '../../middlewares/auth.js';
import { errorFields, getMessage, sendApiError } from '../../utils/apiError.js';

/**
 * A decision that didn't go through: its own status when it has one (an entry changed since it
 * was sent is 409 REVIEW_STALE, not a server error), else what its message says; anything else
 * is a failure, logged with the request.
 */
function reviewError(res: Response, req: Request, err: unknown): void {
    const own =
        (err as { statusCode?: number; status?: number }).statusCode ??
        (err as { status?: number }).status;
    const message = getMessage(err);
    const status =
        typeof own === 'number' && own >= 400 && own < 600
            ? own
            : message.includes('reviewer') || message.includes('admin')
              ? 403
              : message.includes('not found') || message.includes('not pending')
                ? 400
                : 500;
    if (status >= 500) return sendApiError(res, req, err);
    res.status(status).json({ error: message, ...errorFields(err) });
}

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
        const { projectId } = req.params as Record<string, string>;
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
        const { projectId, reviewId } = req.params as Record<string, string>;
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
        const { projectId, reviewId } = req.params as Record<string, string>;
        try {
            const review = await approveReview(projectId, req.user!, reviewId);
            return void res.json({ review });
        } catch (err: unknown) {
            return void reviewError(res, req, err);
        }
    }
);

router.post(
    '/:reviewId/reject',
    requireProjectAccess,
    async (req: Request<ReviewByIdParams, unknown, RejectBody>, res: Response) => {
        const { projectId, reviewId } = req.params as Record<string, string>;
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
            return void reviewError(res, req, err);
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
