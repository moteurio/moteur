import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const authCtx = vi.hoisted(() => ({
    user: {
        id: 'admin1',
        email: 'admin@test.com',
        roles: ['admin'],
        isActive: true,
        name: 'Admin'
    }
}));

vi.mock('../../src/middlewares/auth', () => ({
    requireProjectAccess: (req: any, _res: any, next: any) => {
        req.user = { ...authCtx.user };
        next();
    }
}));

vi.mock('@moteurio/core/users.js', () => ({
    getProjectUsers: vi.fn(),
    updateUserAsOperator: vi.fn()
}));

vi.mock('@moteurio/presence', () => ({
    getOnlineUserIdsForProject: vi.fn(() => ['u-online'])
}));

import usersRouter from '../../src/projects/users.js';
import { getProjectUsers, updateUserAsOperator } from '@moteurio/core/users.js';
import { getOnlineUserIdsForProject } from '@moteurio/presence';

const app = express();
app.use(express.json());
app.use('/projects', usersRouter);

describe('GET /projects/:projectId/users', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        authCtx.user.roles = ['admin'];
        (getOnlineUserIdsForProject as any).mockReturnValue(['u-online']);
    });

    it('returns public DTOs with online and lastLoginAt', async () => {
        (getProjectUsers as any).mockReturnValue([
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

    it('marks online when presence lists user id', async () => {
        (getProjectUsers as any).mockReturnValue([
            {
                id: 'u-online',
                email: 'on@x.com',
                roles: ['user'],
                isActive: true
            }
        ]);

        const res = await request(app).get('/projects/p1/users');
        expect(res.status).toBe(200);
        expect(res.body.users[0].online).toBe(true);
    });
});

describe('PATCH /projects/:projectId/users/:userId', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        authCtx.user.roles = ['admin'];
    });

    it('returns 403 when caller is not platform admin', async () => {
        authCtx.user.roles = ['editor'];
        (getProjectUsers as any).mockReturnValue([
            { id: 'target', email: 't@x.com', roles: ['user'], isActive: true }
        ]);

        const res = await request(app).patch('/projects/p1/users/target').send({ name: 'X' });
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/admin|Platform/i);
        expect(updateUserAsOperator).not.toHaveBeenCalled();
    });

    it('returns 404 when target is not in project', async () => {
        (getProjectUsers as any).mockReturnValue([
            { id: 'other', email: 'o@x.com', roles: ['user'], isActive: true }
        ]);

        const res = await request(app).patch('/projects/p1/users/target').send({ name: 'X' });
        expect(res.status).toBe(404);
        expect(updateUserAsOperator).not.toHaveBeenCalled();
    });

    it('updates user and returns ProjectMemberUser shape', async () => {
        (getProjectUsers as any).mockReturnValue([
            { id: 'target', email: 't@x.com', roles: ['user'], isActive: true }
        ]);
        (getOnlineUserIdsForProject as any).mockReturnValue([]);
        (updateUserAsOperator as any).mockReturnValue({
            id: 'target',
            email: 't@x.com',
            name: 'Ted',
            avatar: undefined,
            roles: ['editor'],
            isActive: true,
            lastLoginAt: undefined,
            passwordHash: 'x',
            projects: ['p1']
        });

        const res = await request(app)
            .patch('/projects/p1/users/target')
            .send({
                name: 'Ted',
                roles: ['editor']
            });

        expect(res.status).toBe(200);
        expect(res.body.user).toEqual({
            id: 'target',
            email: 't@x.com',
            name: 'Ted',
            avatar: undefined,
            roles: ['editor'],
            isActive: true,
            lastLoginAt: undefined,
            online: false
        });
        expect(updateUserAsOperator).toHaveBeenCalledWith(
            'target',
            { name: 'Ted', roles: ['editor'] },
            expect.objectContaining({ id: 'admin1' })
        );
    });

    it('returns 400 for empty patch body', async () => {
        (getProjectUsers as any).mockReturnValue([
            { id: 'target', email: 't@x.com', roles: ['user'], isActive: true }
        ]);

        const res = await request(app).patch('/projects/p1/users/target').send({});
        expect(res.status).toBe(400);
        expect(updateUserAsOperator).not.toHaveBeenCalled();
    });
});
