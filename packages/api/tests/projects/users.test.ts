import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { inProject } from '@moteurio/types';

const authCtx = vi.hoisted(() => ({
    account: {
        id: 'admin1',
        email: 'admin@test.com',
        roles: ['admin'] as string[],
        isActive: true,
        name: 'Admin'
    },
    project: { id: 'p1', users: ['admin1', 'target'] } as {
        id: string;
        users: string[];
        memberRoles?: Record<string, string[]>;
    },
    members: [] as any[]
}));

vi.mock('../../src/middlewares/auth', async () => {
    const { inProject } = await import('@moteurio/types');
    return {
        requireProjectAccess: (req: any, _res: any, next: any) => {
            req.account = { ...authCtx.account };
            req.project = authCtx.project;
            req.user = inProject(req.account, authCtx.project);
            next();
        }
    };
});

vi.mock('@moteurio/core/users.js', () => ({
    getProjectUsers: vi.fn(),
    updateUserAsOperator: vi.fn()
}));

vi.mock('@moteurio/core/projects.js', () => ({
    getProject: vi.fn(async () => authCtx.project),
    updateProject: vi.fn(async (_user: unknown, _id: string, patch: Record<string, unknown>) => {
        authCtx.project = { ...authCtx.project, ...patch };
        return authCtx.project;
    })
}));

vi.mock('@moteurio/core', async importOriginal => {
    const actual = await importOriginal<typeof import('@moteurio/core')>();
    return {
        ...actual,
        getOnlineUserIdsForProject: vi.fn(() => ['u-online'])
    };
});

import usersRouter from '../../src/projects/users.js';
import { getProjectUsers, updateUserAsOperator } from '@moteurio/core/users.js';
import { updateProject } from '@moteurio/core/projects.js';
import { getOnlineUserIdsForProject } from '@moteurio/core';

const app = express();
app.use(express.json());
app.use('/projects', usersRouter);

function membersAre(members: any[]) {
    authCtx.members = members;
    (getProjectUsers as any).mockImplementation(
        (_projectId: string, project?: { memberRoles?: Record<string, string[]> }) =>
            project ? authCtx.members.map(u => inProject(u, project)) : authCtx.members
    );
}

describe('GET /projects/:projectId/users', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        authCtx.account.roles = ['admin'];
        authCtx.project = { id: 'p1', users: ['admin1', 'u1'] };
        (getOnlineUserIdsForProject as any).mockReturnValue(['u-online']);
    });

    it('returns public DTOs with online and lastLoginAt', async () => {
        membersAre([
            {
                id: 'u1',
                email: 'a@x.com',
                name: 'Alice',
                avatar: '/avatars/64/lion.png',
                roles: ['editor'],
                isActive: true,
                lastLoginAt: '2025-01-15T10:00:00.000Z',
                passwordHash: 'secret',
                auth: { githubId: 1 },
                projects: ['p1']
            }
        ]);

        const res = await request(app).get('/projects/p1/users');
        expect(res.status).toBe(200);
        expect(res.body.users).toHaveLength(1);
        expect(res.body.users[0]).toEqual({
            id: 'u1',
            email: 'a@x.com',
            name: 'Alice',
            avatar: '/avatars/64/lion.png',
            roles: ['editor'],
            isActive: true,
            lastLoginAt: '2025-01-15T10:00:00.000Z',
            online: false
        });
        expect(res.body.users[0]).not.toHaveProperty('passwordHash');
        expect(res.body.users[0]).not.toHaveProperty('auth');
        expect(res.body.users[0]).not.toHaveProperty('projects');
        expect(getOnlineUserIdsForProject).toHaveBeenCalledWith('p1');
    });

    it('lists roles in this project when the project sets them', async () => {
        authCtx.project = { id: 'p1', users: ['u1'], memberRoles: { u1: ['reviewer'] } };
        membersAre([{ id: 'u1', email: 'a@x.com', roles: ['writer'], isActive: true }]);

        const res = await request(app).get('/projects/p1/users');
        expect(res.body.users[0].roles).toEqual(['reviewer']);
    });

    it('marks online when presence lists user id', async () => {
        membersAre([{ id: 'u-online', email: 'on@x.com', roles: ['user'], isActive: true }]);

        const res = await request(app).get('/projects/p1/users');
        expect(res.status).toBe(200);
        expect(res.body.users[0].online).toBe(true);
    });
});

describe('PATCH /projects/:projectId/users/:userId', () => {
    const admin = { id: 'admin1', email: 'admin@test.com', roles: ['admin'], isActive: true };
    const target = { id: 'target', email: 't@x.com', roles: ['writer'], isActive: true };

    beforeEach(() => {
        vi.clearAllMocks();
        authCtx.account.roles = ['user'];
        authCtx.project = {
            id: 'p1',
            users: ['admin1', 'target'],
            memberRoles: { admin1: ['admin', 'billing'] }
        };
        (getOnlineUserIdsForProject as any).mockReturnValue([]);
        membersAre([admin, target]);
    });

    it('lets a project admin set roles in this project without touching the account', async () => {
        const res = await request(app)
            .patch('/projects/p1/users/target')
            .send({ roles: ['reviewer'] });

        expect(res.status).toBe(200);
        expect(res.body.user).toEqual({
            id: 'target',
            email: 't@x.com',
            roles: ['reviewer'],
            isActive: true,
            online: false
        });
        expect(updateProject).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'admin1' }),
            'p1',
            {
                memberRoles: { admin1: ['admin', 'billing'], target: ['reviewer'] }
            }
        );
        expect(updateUserAsOperator).not.toHaveBeenCalled();
    });

    it('refuses role changes from someone who is not admin in this project', async () => {
        authCtx.project = {
            id: 'p1',
            users: ['admin1', 'target'],
            memberRoles: { admin1: ['writer'] }
        };

        const res = await request(app)
            .patch('/projects/p1/users/target')
            .send({ roles: ['admin'] });
        expect(res.status).toBe(403);
        expect(updateProject).not.toHaveBeenCalled();
    });

    it('gives developer and billing only through someone who has them, and drops unknown roles', async () => {
        // admin1 is admin and billing here, not developer.
        const dev = await request(app)
            .patch('/projects/p1/users/admin1')
            .send({ roles: ['admin', 'billing', 'developer'] });
        expect(dev.status).toBe(403);
        expect(dev.body.error).toMatch(/developer/);

        const bill = await request(app)
            .patch('/projects/p1/users/target')
            .send({ roles: ['writer', 'billing', 'owner'] });
        expect(bill.status).toBe(200);
        expect(bill.body.user.roles).toEqual(['writer', 'billing']);

        authCtx.project.memberRoles = { admin1: ['admin'], target: ['writer', 'billing'] };
        const take = await request(app)
            .patch('/projects/p1/users/target')
            .send({ roles: ['writer'] });
        expect(take.status).toBe(403);
    });

    it('keeps at least one admin', async () => {
        const res = await request(app)
            .patch('/projects/p1/users/admin1')
            .send({ roles: ['writer'] });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/at least one admin/);
        expect(updateProject).not.toHaveBeenCalled();
    });

    it('leaves account fields to platform operators', async () => {
        const res = await request(app).patch('/projects/p1/users/target').send({ name: 'X' });
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/operator/i);
        expect(updateUserAsOperator).not.toHaveBeenCalled();
    });

    it('never changes account fields: an account is not a project’s, whatever the roles', async () => {
        authCtx.account.roles = ['admin', 'developer'];
        const res = await request(app).patch('/projects/p1/users/target').send({ name: 'Ted' });
        expect(res.status).toBe(403);
        expect(updateUserAsOperator).not.toHaveBeenCalled();
    });

    it('returns 404 when target is not in project', async () => {
        membersAre([admin]);

        const res = await request(app)
            .patch('/projects/p1/users/target')
            .send({ roles: ['writer'] });
        expect(res.status).toBe(404);
        expect(updateProject).not.toHaveBeenCalled();
    });

    it('returns 400 for empty patch body', async () => {
        const res = await request(app).patch('/projects/p1/users/target').send({});
        expect(res.status).toBe(400);
        expect(updateUserAsOperator).not.toHaveBeenCalled();
    });
});
