import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { describe, expect, it } from 'vitest';
import { limitReached } from '../../src/middlewares/rateLimit.js';

describe('rate limits', () => {
    it('say how many seconds until the window resets, in the body and the header', async () => {
        const app = express();
        app.use(
            rateLimit({
                windowMs: 15 * 60 * 1000,
                max: 1,
                standardHeaders: true,
                legacyHeaders: false,
                ...limitReached('Too many login attempts. Please try again later.')
            })
        );
        app.get('/', (_req, res) => void res.json({ ok: true }));
        expect((await request(app).get('/')).status).toBe(200);
        const refused = await request(app).get('/');
        expect(refused.status).toBe(429);
        expect(refused.body).toMatchObject({
            code: 'rate_limited',
            retryAfter: expect.any(Number)
        });
        expect(refused.body.retryAfter).toBeGreaterThan(890);
        expect(refused.body.retryAfter).toBeLessThanOrEqual(900);
        expect(refused.headers['retry-after']).toBe(String(refused.body.retryAfter));
    });
});
