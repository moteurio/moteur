import request from 'supertest';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Who is signed in: the `x-as` header names them. Everything else is the real core, in a folder.
vi.mock('../../src/middlewares/auth.js', async () => {
    const { getUserById } = await import('@moteurio/core/users.js');
    const signedIn = (req: any, res: any, next: any) => {
        const user = getUserById(String(req.headers['x-as']));
        if (!user) return void res.status(401).json({ error: 'No token provided' });
        req.user = user;
        req.account = user;
        next();
    };
    return { requireAuth: signedIn, requireProjectAccess: signedIn };
});

const { reloadUsers, getUserById } = await import('@moteurio/core/users.js');
const { reloadWorkspaces, getWorkspace } = await import('@moteurio/core/workspaces.js');
const { createProject, getProjectIdsForUser } = await import('@moteurio/core/projects.js');
const { gitIdle } = await import('@moteurio/core/git/gitService.js');
const { default: workspaces } = await import('../../src/workspaces/index.js');
const { default: invites } = await import('../../src/invites/index.js');
const { default: move } = await import('../../src/projects/move.js');

const app = express();
app.use(express.json());
app.use('/workspaces', workspaces);
app.use('/invites', invites);
app.use('/projects', move);

const as = (id: string) => ({ 'x-as': id });

describe('/workspaces', () => {
    let root: string;
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-api-workspaces-'));
        vi.stubEnv('DATA_ROOT', root);
        vi.stubEnv('AUTH_USERS_FILE', path.join(root, 'users.json'));
        vi.stubEnv('STUDIO_URL', 'https://studio.example');
        const person = (id: string) => ({
            id,
            email: `${id}@agency.test`,
            name: id,
            isActive: true,
            roles: [],
            projects: []
        });
        fs.writeFileSync(
            path.join(root, 'users.json'),
            JSON.stringify(['owen', 'ada', 'theo'].map(person))
        );
        reloadUsers();
        reloadWorkspaces();
    });
    afterEach(async () => {
        await gitIdle();
        vi.unstubAllEnvs();
        reloadUsers();
        reloadWorkspaces();
        fs.rmSync(root, { recursive: true, force: true });
    });

    async function agency() {
        const res = await request(app).post('/workspaces').set(as('owen')).send({ name: 'Agency' });
        expect(res.status).toBe(201);
        return res.body.workspace.id as string;
    }

    it('starts one, lists it, and hides it from anyone outside', async () => {
        const id = await agency();
        const list = await request(app).get('/workspaces').set(as('owen'));
        expect(list.body.workspaces).toEqual([
            expect.objectContaining({ id, name: 'Agency', role: 'owner', members: 1, projects: 0 })
        ]);
        const one = await request(app).get(`/workspaces/${id}`).set(as('owen'));
        expect(one.body.workspace.people).toEqual([
            expect.objectContaining({ id: 'owen', email: 'owen@agency.test', role: 'owner' })
        ]);
        expect((await request(app).get(`/workspaces/${id}`).set(as('ada'))).status).toBe(404);
        expect(
            (await request(app).patch(`/workspaces/${id}`).set(as('ada')).send({ name: 'X' }))
                .status
        ).toBe(404);
        expect((await request(app).get('/workspaces').set(as('ada'))).body.workspaces).toEqual([]);
    });

    it('invites someone in, and they join with the place they were given', async () => {
        const id = await agency();
        const sent = await request(app)
            .post(`/workspaces/${id}/invites`)
            .set(as('owen'))
            .send({ email: 'Ada@agency.test', role: 'member', access: 'all' });
        expect(sent.status).toBe(201);
        expect(sent.body).toMatchObject({
            invite: { email: 'ada@agency.test', role: 'member', access: 'all' },
            url: expect.stringMatching(/^https:\/\/studio\.example\/invite\//)
        });
        const token = sent.body.path.split('/').pop();

        const looked = await request(app).get(`/invites/${token}`);
        expect(looked.body).toMatchObject({
            workspace: { id, name: 'Agency' },
            member: { role: 'member', access: 'all' },
            hasAccount: true
        });
        expect((await request(app).post(`/invites/${token}/accept`).set(as('theo'))).status).toBe(
            403
        );
        const accepted = await request(app).post(`/invites/${token}/accept`).set(as('ada'));
        expect(accepted.body).toEqual({ workspaceId: id });
        expect(getWorkspace(id)!.members.ada).toMatchObject({ role: 'member', access: 'all' });
        expect((await request(app).get(`/invites/${token}`)).status).toBe(404);

        // Already in: no second invite.
        expect(
            (
                await request(app)
                    .post(`/workspaces/${id}/invites`)
                    .set(as('owen'))
                    .send({ email: 'ada@agency.test', role: 'admin' })
            ).status
        ).toBe(409);
    });

    it('invites nobody into someone’s own workspace', async () => {
        await createProject(getUserById('owen')!, {
            id: 'blog',
            label: 'Blog',
            defaultLocale: 'en'
        });
        const own = (await request(app).get('/workspaces').set(as('owen'))).body.workspaces.find(
            (w: { personal: boolean }) => w.personal
        );
        const sent = await request(app)
            .post(`/workspaces/${own.id}/invites`)
            .set(as('owen'))
            .send({ email: 'ada@agency.test', role: 'admin' });
        expect(sent.status).toBe(409);
        expect(sent.body.code).toBe('PERSONAL_WORKSPACE');
        expect(
            (await request(app).get(`/workspaces/${own.id}/invites`).set(as('owen'))).body
        ).toEqual({ invites: [] });
    });

    it('lets only owners invite owners, and only managers see invites', async () => {
        const id = await agency();
        await request(app)
            .post(`/workspaces/${id}/invites`)
            .set(as('owen'))
            .send({ email: 'ada@agency.test', role: 'admin' });
        const token = (
            await request(app)
                .post(`/workspaces/${id}/invites`)
                .set(as('owen'))
                .send({ email: 'theo@agency.test', role: 'member' })
        ).body.path
            .split('/')
            .pop();
        await request(app).post(`/invites/${token}/accept`).set(as('theo'));

        expect((await request(app).get(`/workspaces/${id}/invites`).set(as('theo'))).status).toBe(
            403
        );
        expect(
            (
                await request(app)
                    .post(`/workspaces/${id}/invites`)
                    .set(as('theo'))
                    .send({ email: 'x@agency.test', role: 'member' })
            ).status
        ).toBe(403);
        const list = await request(app).get(`/workspaces/${id}/invites`).set(as('owen'));
        expect(list.body.invites.map((i: { email: string }) => i.email)).toEqual([
            'ada@agency.test'
        ]);
        const bad = await request(app)
            .post(`/workspaces/${id}/invites`)
            .set(as('owen'))
            .send({ email: 'x@agency.test', role: 'boss' });
        expect(bad.status).toBe(400);
    });

    it('changes and removes members, always keeping an owner', async () => {
        const id = await agency();
        const token = (
            await request(app)
                .post(`/workspaces/${id}/invites`)
                .set(as('owen'))
                .send({ email: 'ada@agency.test', role: 'member' })
        ).body.path
            .split('/')
            .pop();
        await request(app).post(`/invites/${token}/accept`).set(as('ada'));

        const changed = await request(app)
            .patch(`/workspaces/${id}/members/ada`)
            .set(as('owen'))
            .send({ role: 'admin' });
        expect(changed.status).toBe(200);
        const last = await request(app).delete(`/workspaces/${id}/members/owen`).set(as('owen'));
        expect(last.status).toBe(409);
        expect(last.body.code).toBe('LAST_OWNER');
        // Leaving, as yourself.
        expect(
            (await request(app).delete(`/workspaces/${id}/members/ada`).set(as('ada'))).status
        ).toBe(204);
        expect(Object.keys(getWorkspace(id)!.members)).toEqual(['owen']);
    });

    it('deletes an empty one, and moves projects out first', async () => {
        const id = await agency();
        const other = (
            await request(app).post('/workspaces').set(as('owen')).send({ name: 'Client' })
        ).body.workspace.id;
        await createProject((await import('@moteurio/core/users.js')).getUserById('owen')!, {
            id: 'site',
            label: 'Site',
            defaultLocale: 'en',
            workspaceId: id
        });
        const full = await request(app).delete(`/workspaces/${id}`).set(as('owen'));
        expect(full.status).toBe(409);
        expect(full.body.code).toBe('WORKSPACE_NOT_EMPTY');

        expect(
            (await request(app).post('/projects/site/move').set(as('owen')).send({})).status
        ).toBe(400);
        const moved = await request(app)
            .post('/projects/site/move')
            .set(as('owen'))
            .send({ workspaceId: other });
        expect(moved.status).toBe(200);
        expect(moved.body.project.workspaceId).toBe(other);
        expect(getProjectIdsForUser('owen')).toEqual(['site']);

        expect((await request(app).delete(`/workspaces/${id}`).set(as('owen'))).status).toBe(204);
        expect(getWorkspace(id)).toBeUndefined();
    });
});
