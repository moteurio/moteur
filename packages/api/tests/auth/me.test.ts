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

const store = vi.hoisted(() => ({ name: 'test' }));
vi.mock('@moteurio/core/users.js', async importOriginal => ({
    ...(await importOriginal<object>()),
    updateStoredUser: async (id: string, update: (u: any) => any) => {
        const next = update({ id, email: 'test@example.com', name: store.name, passwordHash: 'x' });
        store.name = next.name;
        return next;
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

describe('PATCH /auth/me', () => {
    it('changes your name, tidied', async () => {
        const res = await request(app).patch('/auth/me').send({ name: '  Mathieu   Ducharme ' });
        expect(res.status).toBe(200);
        expect(res.body.user).toMatchObject({ id: 'user123', name: 'Mathieu Ducharme' });
        expect(res.body.user).not.toHaveProperty('passwordHash');
        expect(store.name).toBe('Mathieu Ducharme');
    });

    it('refuses what is not a name', async () => {
        for (const name of ['', '   ', 42, 'x'.repeat(121)]) {
            const res = await request(app).patch('/auth/me').send({ name });
            expect(res.status).toBe(400);
            expect(res.body.code).toBe('NAME_INVALID');
        }
    });
});
