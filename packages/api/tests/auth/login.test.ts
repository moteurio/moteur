import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@moteurio/core/auth', () => ({
    loginUser: vi.fn()
}));

vi.mock('../../src/middlewares/rateLimit', () => ({
    loginRateLimiter: (_req: any, _res: any, next: () => void) => next()
}));

import authRoutes from '../../src/auth/login';
import { loginUser } from '@moteurio/core/auth';

const app = express();
app.use(express.json());
app.use('/auth', authRoutes);

describe('POST /auth/login', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return 400 if username or password is missing', async () => {
        const res = await request(app).post('/auth/login').send({});
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error');
    });

    it('should return 400 if username is not a valid email', async () => {
        const res = await request(app)
            .post('/auth/login')
            .send({ username: 'not-an-email', password: 'password' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Missing|Invalid/);
    });

    it('should return 200 and token/user if credentials are valid', async () => {
        (loginUser as any).mockResolvedValue({
            token: 'fake-jwt-token',
            user: { id: 'user123', email: 'tester@example.com' }
        });

        const res = await request(app)
            .post('/auth/login')
            .send({ username: 'tester@example.com', password: 'password' });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            token: 'fake-jwt-token',
            user: { id: 'user123', email: 'tester@example.com' }
        });
        expect(loginUser).toHaveBeenCalledWith('tester@example.com', 'password');
    });

    it('should return 401 if credentials are invalid', async () => {
        (loginUser as any).mockRejectedValue(new Error('Invalid credentials'));

        const res = await request(app)
            .post('/auth/login')
            .send({ username: 'tester@example.com', password: 'wrongpass' });

        expect(res.status).toBe(401);
        expect(res.body).toMatchObject({ error: 'Invalid credentials' });
    });
});
