import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const person = {
    id: 'louise',
    name: 'Louise',
    email: 'louise@test.dev',
    isActive: true,
    roles: ['admin'],
    projects: []
};

vi.mock('@moteurio/core/users.js', () => ({ getUserById: () => person }));
vi.mock('@moteurio/core/projects.js', () => ({ getProjectIdsForUser: () => ['demo'] }));

/** The route, with the request signed in as `user`. */
async function appAs(user: Record<string, unknown>) {
    vi.doMock('../../src/middlewares/auth.js', () => ({
        requireAuth: (req: any, _res: any, next: any) => {
            req.user = user;
            next();
        }
    }));
    const app = express();
    app.use(express.json());
    app.use('/auth/session-token', (await import('../../src/auth/sessionToken.js')).default);
    return app;
}

const claims = (token: string) => jwt.decode(token) as Record<string, any>;

describe('POST /auth/session-token for an agent', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.stubEnv('JWT_SECRET', 'test-secret');
    });

    it('gives the agent a token, review-only unless the person allows more', async () => {
        const app = await appAs(person);
        const res = await request(app)
            .post('/auth/session-token')
            .send({ agent: { name: 'Claude' } });
        expect(res.status).toBe(200);
        expect(claims(res.body.sessionToken).agent).toEqual({ name: 'Claude', reviewOnly: true });
        const free = await request(app)
            .post('/auth/session-token')
            .send({ agent: { name: 'Claude', reviewOnly: false } });
        expect(claims(free.body.sessionToken).agent.reviewOnly).toBe(false);
    });

    it('keeps an agent token’s agent: it can’t mint itself a freer one', async () => {
        const app = await appAs({
            ...person,
            name: 'Louise via Claude',
            agent: { name: 'Claude', reviewOnly: true }
        });
        const res = await request(app)
            .post('/auth/session-token')
            .send({ agent: { name: 'Someone else', reviewOnly: false } });
        const c = claims(res.body.sessionToken);
        expect(c.agent).toEqual({ name: 'Claude', reviewOnly: true });
        expect(c.name).toBe('Louise');
    });

    it('a person’s token without an agent stays a person’s', async () => {
        const res = await request(await appAs(person))
            .post('/auth/session-token')
            .send({});
        expect(claims(res.body.sessionToken).agent).toBeUndefined();
    });
});
