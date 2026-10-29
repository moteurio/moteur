import request from 'supertest';
import express from 'express';
import { afterEach, describe, it, expect, vi } from 'vitest';

vi.mock('../../src/middlewares/auth', () => ({
    requireProjectAccess: (req: any, _res: any, next: any) => {
        req.user = { id: 'r1', roles: ['reviewer'] };
        next();
    }
}));

const approveReview = vi.fn();
vi.mock('@moteurio/core/reviews.js', () => ({
    approveReview: (...args: unknown[]) => approveReview(...args),
    rejectReview: vi.fn(),
    getReviews: vi.fn(),
    getReview: vi.fn()
}));

import reviewsRoute from '../../src/projects/reviews/index';
import { logUnloggedErrors, requestIdMiddleware } from '../../src/middlewares/requestId';

const app = express();
app.use(requestIdMiddleware);
app.use(logUnloggedErrors);
app.use(express.json());
app.use('/projects/:projectId/reviews', reviewsRoute);
app.get('/by-hand', (_req, res) => void res.status(500).json({ error: 'Failed' }));

describe('a review decision that does not go through', () => {
    afterEach(() => vi.restoreAllMocks());

    it('says the entry changed since it was sent (409), not a server error', async () => {
        approveReview.mockRejectedValue(
            Object.assign(new Error('This changed after it was sent for review.'), {
                statusCode: 409,
                code: 'REVIEW_STALE'
            })
        );
        const res = await request(app).post('/projects/p1/reviews/rv1/approve');
        expect(res.status).toBe(409);
        expect(res.body).toMatchObject({ code: 'REVIEW_STALE' });
    });

    it('logs a real failure, with the request’s id', async () => {
        const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
        approveReview.mockRejectedValue(new Error('disk full'));
        const res = await request(app).post('/projects/p1/reviews/rv1/approve');
        expect(res.status).toBe(500);
        expect(res.headers['x-request-id']).toBeTruthy();
        expect(logged).toHaveBeenCalledTimes(1);
        expect(logged.mock.calls[0]![1]).toMatchObject({ requestId: res.headers['x-request-id'] });
    });
});

describe('server errors no route logged', () => {
    afterEach(() => vi.restoreAllMocks());

    it('are logged with the request', async () => {
        const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
        const res = await request(app).get('/by-hand');
        expect(res.status).toBe(500);
        expect(logged).toHaveBeenCalledWith(
            '[API] server error',
            expect.objectContaining({ method: 'GET', path: '/by-hand', status: 500 })
        );
    });
});
