import request from 'supertest';
import express from 'express';
import meRoute from '../../src/auth/me';
import { describe, it, expect, vi } from 'vitest';

// 🧪 Mock the auth middleware
vi.mock('../../src/middlewares/auth', () => ({
    requireAuth: (req: any, _res: any, next: any) => {
        req.user = {
            id: 'user123',
            username: 'testuser',
            email: 'test@example.com',
            passwordHash: 'should-not-leak'
        };
        next();
    }
}));

const app = express();
app.use(express.json());
app.use('/auth', meRoute);

describe('GET /auth/me', () => {
    it('should return the authenticated user without passwordHash', async () => {
        const res = await request(app).get('/auth/me');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('user');
        expect(res.body.user).toMatchObject({
            id: 'user123',
            username: 'testuser',
            email: 'test@example.com'
        });
        expect(res.body.user).not.toHaveProperty('passwordHash');
    });
});
