import request from 'supertest';
import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ctx = vi.hoisted(() => ({
    invite: null as null | {
        id: string;
        projectId: string;
        email: string;
        roles: string[];
        invitedBy: string;
        expiresAt: string;
    },
    signedIn: { id: 'u-louise', email: 'Louise@atelier.example', roles: [], isActive: true },
    project: { id: 'p1', label: 'Atelier', users: ['u-admin'] } as {
        id: string;
        label: string;
        users: string[];
    },
    accounts: [] as { id: string; email: string }[]
}));

vi.mock('../../src/middlewares/auth', () => ({
    requireAuth: (req: any, _res: any, next: any) => {
        req.user = ctx.signedIn;
        next();
    }
}));

vi.mock('@moteurio/core/invites.js', () => ({
    findInviteByToken: vi.fn(() => ctx.invite),
    consumeInvite: vi.fn()
}));

vi.mock('@moteurio/core/users.js', () => ({
    createUser: vi.fn((u: any) => u),
    getUserByEmail: vi.fn((email: string) => ctx.accounts.find(a => a.email === email)),
    getUserById: vi.fn(() => ({ id: 'u-admin', name: 'Ada' })),
    listUsers: vi.fn(() => ctx.accounts),
    recordUserLogin: vi.fn(() => '2026-10-19T05:00:00.000Z'),
    reloadUsers: vi.fn()
}));

vi.mock('@moteurio/core/projects.js', () => ({
    getProjectById: vi.fn(async () => ctx.project),
    addProjectMember: vi.fn(async () => ctx.project),
    getProjectIdsForUser: vi.fn(() => ['p1'])
}));

vi.mock('@moteurio/core/auth.js', () => ({
    passwordProblem: (p: string) => (p.length < 8 ? 'Too short' : null),
    generateJWT: vi.fn(() => 'jwt'),
    hashPassword: vi.fn(async () => 'hash')
}));

import invitesRouter from '../../src/invites/index.js';
import { consumeInvite } from '@moteurio/core/invites.js';
import { createUser } from '@moteurio/core/users.js';
import { addProjectMember } from '@moteurio/core/projects.js';
import { setPeopleLimit } from '@moteurio/core/planLimits.js';

const app = express();
app.use(express.json());
app.use('/invites', invitesRouter);

const TOKEN = 'a-token-long-enough-to-pass';

describe('invites', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        ctx.invite = {
            id: 'invite:1',
            projectId: 'p1',
            email: 'louise@atelier.example',
            roles: ['reviewer'],
            invitedBy: 'u-admin',
            expiresAt: '2026-10-26T05:00:00.000Z'
        };
        ctx.project = { id: 'p1', label: 'Atelier', users: ['u-admin'] };
        ctx.accounts = [];
        ctx.signedIn = {
            id: 'u-louise',
            email: 'Louise@atelier.example',
            roles: [],
            isActive: true
        };
    });

    it('describes a live invite, and 404s a dead one', async () => {
        const res = await request(app).get(`/invites/${TOKEN}`);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            email: 'louise@atelier.example',
            project: { id: 'p1', label: 'Atelier' },
            invitedBy: { name: 'Ada' },
            hasAccount: false
        });
        ctx.invite = null;
        expect((await request(app).get(`/invites/${TOKEN}`)).status).toBe(404);
    });

    it('sees an account whose address differs only in case', async () => {
        ctx.accounts = [{ id: 'u-louise', email: 'Louise@Atelier.example' }];
        const res = await request(app).get(`/invites/${TOKEN}`);
        expect(res.body.hasAccount).toBe(true);
    });

    it('lets the invited address join, once', async () => {
        const res = await request(app).post(`/invites/${TOKEN}/accept`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ projectId: 'p1' });
        expect(addProjectMember).toHaveBeenCalledWith('p1', ctx.signedIn, ['reviewer']);
        expect(consumeInvite).toHaveBeenCalledWith('invite:1');
    });

    it('refuses another address', async () => {
        ctx.signedIn = { ...ctx.signedIn, email: 'someone@else.example' };
        const res = await request(app).post(`/invites/${TOKEN}/accept`);
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('email_mismatch');
        expect(addProjectMember).not.toHaveBeenCalled();
        expect(consumeInvite).not.toHaveBeenCalled();
    });

    it('keeps the roles of someone already a member', async () => {
        ctx.project.users.push('u-louise');
        await request(app).post(`/invites/${TOKEN}/accept`).expect(200);
        expect(addProjectMember).not.toHaveBeenCalled();
        expect(consumeInvite).toHaveBeenCalled();
    });

    it('creates an account from the link and signs in', async () => {
        const res = await request(app)
            .post(`/invites/${TOKEN}/register`)
            .send({ name: 'Louise', password: 'long enough' });
        expect(res.status).toBe(201);
        expect(res.body.token).toBe('jwt');
        expect(res.body.user).not.toHaveProperty('passwordHash');
        expect(createUser).toHaveBeenCalledWith(
            expect.objectContaining({ email: 'louise@atelier.example', passwordHash: 'hash' })
        );
        expect(consumeInvite).toHaveBeenCalledWith('invite:1');
    });

    it('asks for a name and a real password', async () => {
        const noName = await request(app)
            .post(`/invites/${TOKEN}/register`)
            .send({ password: 'long enough' });
        expect(noName.body.code).toBe('name');
        const short = await request(app)
            .post(`/invites/${TOKEN}/register`)
            .send({ name: 'Louise', password: 'short' });
        expect(short.body.code).toBe('password');
    });

    it('sends someone with an account to sign in instead', async () => {
        ctx.accounts = [{ id: 'u-louise', email: 'louise@atelier.example' }];
        const res = await request(app)
            .post(`/invites/${TOKEN}/register`)
            .send({ name: 'Louise', password: 'long enough' });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('account_exists');
        expect(createUser).not.toHaveBeenCalled();
    });

    it('creates no account when the project is full for its plan', async () => {
        setPeopleLimit(() => 1);
        try {
            const res = await request(app)
                .post(`/invites/${TOKEN}/register`)
                .send({ name: 'Louise', password: 'long enough' });
            expect(res.status).toBe(402);
            expect(res.body).toMatchObject({ code: 'plan_limit', limit: 'people', max: 1 });
            expect(createUser).not.toHaveBeenCalled();
            expect(consumeInvite).not.toHaveBeenCalled();
        } finally {
            setPeopleLimit(null);
        }
    });
});
