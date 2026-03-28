import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

vi.mock('@moteurio/core/auth', () => ({
    loginUser: vi.fn()
}));

vi.mock('../../src/middlewares/rateLimit', () => ({
    loginRateLimiter: (_req: any, _res: any, next: () => void) => next()
}));

import authRoutes from '../../src/auth/login';
import { loginUser } from '@moteurio/core/auth';
import * as loginDelayStore from '../../src/auth/loginDelayStore';

const app = express();
app.use(express.json());
app.use('/auth', authRoutes);

describe('POST /auth/login', () => {
    beforeAll(() => {
        vi.spyOn(loginDelayStore, 'sleep').mockResolvedValue(undefined);
    });

    beforeEach(() => {
        vi.clearAllMocks();
        loginDelayStore.resetLoginDelayStoreForTests();
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
        expect(loginDelayStore.sleep).toHaveBeenCalledWith(0);
    });

    it('should sleep progressively after repeated failures and hint retryAfterSeconds', async () => {
        (loginUser as any).mockRejectedValue(new Error('Invalid credentials'));

        await request(app)
            .post('/auth/login')
            .send({ username: 'slow@example.com', password: 'bad1' });

        const res2 = await request(app)
            .post('/auth/login')
            .send({ username: 'slow@example.com', password: 'bad2' });

        expect(res2.status).toBe(401);
        expect(res2.body.error).toBe('Too many failed attempts, please wait before trying again.');
        expect(res2.body.retryAfterSeconds).toBe(2);
        expect(loginDelayStore.sleep).toHaveBeenLastCalledWith(1000);
    });

    it('should reset failure state after successful login', async () => {
        (loginUser as any).mockRejectedValueOnce(new Error('Invalid credentials'));
        await request(app)
            .post('/auth/login')
            .send({ username: 'ok@example.com', password: 'bad' });

        (loginUser as any).mockResolvedValueOnce({
            token: 't',
            user: { id: 'u1', email: 'ok@example.com' }
        });
        await request(app)
            .post('/auth/login')
            .send({ username: 'ok@example.com', password: 'good' });

        (loginUser as any).mockRejectedValueOnce(new Error('Invalid credentials'));
        await request(app)
            .post('/auth/login')
            .send({ username: 'ok@example.com', password: 'bad2' });

        expect(loginDelayStore.sleep).toHaveBeenLastCalledWith(0);
    });

    it('should return 400 if password exceeds max length (bcrypt DoS mitigation)', async () => {
        const longPassword = 'a'.repeat(129);
        const res = await request(app)
            .post('/auth/login')
            .send({ username: 'tester@example.com', password: longPassword });

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'Invalid request' });
        expect(loginUser).not.toHaveBeenCalled();
    });

    it('should accept password at max length and call loginUser', async () => {
        const maxPassword = 'b'.repeat(128);
        (loginUser as any).mockResolvedValue({
            token: 'fake-jwt-token',
            user: { id: 'user123', email: 'tester@example.com' }
        });

        const res = await request(app)
            .post('/auth/login')
            .send({ username: 'tester@example.com', password: maxPassword });

        expect(res.status).toBe(200);
        expect(loginUser).toHaveBeenCalledWith('tester@example.com', maxPassword);
    });
});
