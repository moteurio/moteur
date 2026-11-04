import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inProject, isInProject, rolesInProject, workspaceProjectRoles } from '@moteurio/types';
import type { Workspace } from '@moteurio/types/Workspace.js';

const projects = await import('../src/projects.js');
const workspaces = await import('../src/workspaces.js');
const { getProjectUsers, getUserById, reloadUsers } = await import('../src/users.js');
const { gitIdle } = await import('../src/git/gitService.js');
const invites = await import('../src/invites.js');

const at = '2026-11-03T00:00:00Z';
const team = (members: Workspace['members']): Workspace => ({
    id: 'ws_team',
    name: 'Team',
    createdAt: at,
    createdBy: 'owen',
    members
});

describe('what a workspace gives in its projects', () => {
    const ws = team({
        owen: { role: 'owner', joinedAt: at },
        ada: { role: 'admin', joinedAt: at },
        bill: { role: 'billing', joinedAt: at },
        all: { role: 'member', access: 'all', projectRoles: ['builder'], joinedAt: at },
        plain: { role: 'member', access: 'all', joinedAt: at },
        some: { role: 'member', access: 'chosen', joinedAt: at }
    });
    const project = {
        users: ['some', 'guest', 'ada'],
        memberRoles: { guest: ['writer'], ada: ['writer'], bill: ['admin'] }
    };

    it('gives owners, admins, billing and "all" members every project', () => {
        expect(workspaceProjectRoles(ws, 'owen')).toEqual(['admin', 'billing', 'developer']);
        expect(workspaceProjectRoles(ws, 'ada')).toEqual(['admin', 'developer']);
        expect(workspaceProjectRoles(ws, 'bill')).toEqual(['billing']);
        expect(workspaceProjectRoles(ws, 'all')).toEqual(['builder']);
        expect(workspaceProjectRoles(ws, 'plain')).toEqual(['writer']);
        expect(workspaceProjectRoles(ws, 'some')).toBeNull();
        expect(workspaceProjectRoles(ws, 'stranger')).toBeNull();
    });

    it('lets "chosen" members and guests in only where they were added', () => {
        expect(isInProject('some', project, ws)).toBe(true);
        expect(isInProject('some', { users: [] }, ws)).toBe(false);
        expect(isInProject('guest', project, ws)).toBe(true);
        expect(isInProject('guest', project, null)).toBe(true);
        expect(isInProject('stranger', project, ws)).toBe(false);
        expect(isInProject('all', { users: [] }, ws)).toBe(true);
    });

    it('lets a project set its own roles, but never below an owner’s or admin’s', () => {
        // A project may say more about Billing (or a Member) than the workspace does.
        expect(rolesInProject({ id: 'bill', roles: [] }, project, ws)).toEqual(['admin']);
        // An admin of the workspace keeps admin there, whatever the project says.
        expect(rolesInProject({ id: 'ada', roles: [] }, project, ws)).toEqual([
            'writer',
            'admin',
            'developer'
        ]);
        expect(inProject({ id: 'owen', roles: ['writer'] }, { users: [] }, ws).roles).toEqual([
            'admin',
            'billing',
            'developer'
        ]);
        // No workspace: as before, the project's roles, else the account's.
        expect(rolesInProject({ id: 'some', roles: ['reviewer'] }, project)).toEqual(['reviewer']);
    });
});

describe('workspaces, stored', () => {
    let root: string;
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-workspaces-'));
        vi.stubEnv('DATA_ROOT', root);
        vi.stubEnv('AUTH_USERS_FILE', path.join(root, 'users.json'));
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
            JSON.stringify([person('owen'), person('ada'), person('theo'), person('client')])
        );
        reloadUsers();
        workspaces.reloadWorkspaces();
    });
    afterEach(async () => {
        await gitIdle();
        vi.unstubAllEnvs();
        reloadUsers();
        workspaces.reloadWorkspaces();
        fs.rmSync(root, { recursive: true, force: true });
    });

    const me = (id: string) => getUserById(id)!;

    it('keeps them next to the users, privately', async () => {
        const ws = await workspaces.createWorkspace(me('owen'), '  Atelier Nord  ');
        expect(ws).toMatchObject({ name: 'Atelier Nord', members: { owen: { role: 'owner' } } });
        expect(ws.id).toMatch(/^ws_[A-Za-z0-9]+$/);
        const file = path.join(root, 'workspaces.json');
        expect(fs.statSync(file).mode & 0o777).toBe(0o600);
        workspaces.reloadWorkspaces();
        expect(workspaces.getWorkspace(ws.id)?.name).toBe('Atelier Nord');
        await expect(workspaces.createWorkspace(me('owen'), ' ')).rejects.toMatchObject({
            status: 400
        });
    });

    it('makes someone’s own workspace once, with their first project', async () => {
        await projects.createProject(me('theo'), {
            id: 'blog',
            label: 'Blog',
            defaultLocale: 'en'
        });
        await projects.createProject(me('theo'), {
            id: 'shop',
            label: 'Shop',
            defaultLocale: 'en'
        });
        const own = workspaces.personalWorkspaceOf('theo')!;
        expect(own).toMatchObject({ name: 'theo', personal: { userId: 'theo' } });
        expect(workspaces.listWorkspaces()).toHaveLength(1);
        expect(
            workspaces
                .projectsInWorkspace(own.id)
                .map(p => p.id)
                .sort()
        ).toEqual(['blog', 'shop']);
    });

    it('puts a project in the workspace asked for, if they may start one there', async () => {
        const ws = await workspaces.createWorkspace(me('owen'), 'Agency');
        await workspaces.addWorkspaceMember(ws.id, 'ada', { role: 'billing' });
        const made = await projects.createProject(me('owen'), {
            id: 'client-a',
            label: 'Client A',
            defaultLocale: 'en',
            workspaceId: ws.id
        });
        expect(made.project?.workspaceId).toBe(ws.id);
        // Billing pays; it doesn't start projects.
        await expect(
            projects.createProject(me('ada'), {
                id: 'client-b',
                label: 'Client B',
                defaultLocale: 'en',
                workspaceId: ws.id
            })
        ).rejects.toMatchObject({ status: 403 });
        // Someone outside it doesn't learn it exists.
        await expect(
            projects.createProject(me('theo'), {
                id: 'client-c',
                label: 'Client C',
                defaultLocale: 'en',
                workspaceId: ws.id
            })
        ).rejects.toMatchObject({ status: 404 });
    });

    it('lets the team in, and a client only into their project', async () => {
        const ws = await workspaces.createWorkspace(me('owen'), 'Agency');
        await workspaces.addWorkspaceMember(ws.id, 'ada', { role: 'member', access: 'all' });
        await workspaces.addWorkspaceMember(ws.id, 'theo', { role: 'member' });
        for (const id of ['client-a', 'client-b'])
            await projects.createProject(me('owen'), {
                id,
                label: id,
                defaultLocale: 'en',
                workspaceId: ws.id
            });
        await projects.addProjectMember('client-a', me('client'), ['writer']);

        expect(projects.getProjectIdsForUser('owen').sort()).toEqual(['client-a', 'client-b']);
        expect(projects.getProjectIdsForUser('ada').sort()).toEqual(['client-a', 'client-b']);
        // A Member with "chosen" access starts with none.
        expect(projects.getProjectIdsForUser('theo')).toEqual([]);
        expect(projects.getProjectIdsForUser('client')).toEqual(['client-a']);
        await expect(projects.getProject(me('client'), 'client-b')).rejects.toThrow();
        expect(
            projects
                .listProjects(me('ada'))
                .map(p => p.id)
                .sort()
        ).toEqual(['client-a', 'client-b']);

        const project = (await projects.getProjectById('client-a'))!;
        const people = getProjectUsers('client-a', project);
        expect(people.map(u => u.id).sort()).toEqual(['ada', 'client', 'owen']);
        expect(people.find(u => u.id === 'ada')?.roles).toEqual(['writer']);
    });

    it('never moves a project between workspaces in an update', async () => {
        const ws = await workspaces.createWorkspace(me('owen'), 'Agency');
        await projects.createProject(me('owen'), {
            id: 'site',
            label: 'Site',
            defaultLocale: 'en'
        });
        const updated = await projects.updateProject(me('owen'), 'site', {
            label: 'Site 2',
            workspaceId: ws.id
        });
        expect(updated.label).toBe('Site 2');
        expect(updated.workspaceId).toBe(workspaces.personalWorkspaceOf('owen')!.id);
    });

    it('always keeps an owner, and only owners touch owners', async () => {
        const ws = await workspaces.createWorkspace(me('owen'), 'Agency');
        await workspaces.addWorkspaceMember(ws.id, 'ada', { role: 'admin' });
        await expect(
            workspaces.updateWorkspaceMember(me('owen'), ws.id, 'owen', { role: 'member' })
        ).rejects.toMatchObject({ code: 'LAST_OWNER' });
        await expect(
            workspaces.removeWorkspaceMember(me('owen'), ws.id, 'owen')
        ).rejects.toMatchObject({ code: 'LAST_OWNER' });
        await expect(
            workspaces.updateWorkspaceMember(me('ada'), ws.id, 'ada', { role: 'owner' })
        ).rejects.toMatchObject({ status: 403 });
        await expect(
            workspaces.updateWorkspaceMember(me('ada'), ws.id, 'owen', { role: 'admin' })
        ).rejects.toMatchObject({ status: 403 });
        await workspaces.updateWorkspaceMember(me('owen'), ws.id, 'ada', { role: 'owner' });
        await workspaces.removeWorkspaceMember(me('owen'), ws.id, 'owen');
        expect(Object.keys(workspaces.getWorkspace(ws.id)!.members)).toEqual(['ada']);
    });

    it('checks what a member is given', async () => {
        const ws = await workspaces.createWorkspace(me('owen'), 'Agency');
        await expect(
            workspaces.addWorkspaceMember(ws.id, 'ada', { role: 'boss' as never })
        ).rejects.toMatchObject({ status: 400 });
        await expect(
            workspaces.addWorkspaceMember(ws.id, 'ada', {
                role: 'member',
                access: 'all',
                projectRoles: ['wizard']
            })
        ).rejects.toMatchObject({ status: 400 });
        const after = await workspaces.addWorkspaceMember(ws.id, 'ada', {
            role: 'member',
            projectRoles: ['builder']
        });
        // Roles for every project mean nothing to a "chosen" member: not kept.
        expect(after.members.ada).toEqual({
            role: 'member',
            access: 'chosen',
            joinedAt: expect.any(String)
        });
    });

    it('deletes a workspace only when empty, and only by an owner', async () => {
        const ws = await workspaces.createWorkspace(me('owen'), 'Agency');
        await workspaces.addWorkspaceMember(ws.id, 'ada', { role: 'admin' });
        await projects.createProject(me('owen'), {
            id: 'site',
            label: 'Site',
            defaultLocale: 'en',
            workspaceId: ws.id
        });
        await expect(workspaces.deleteWorkspace(me('ada'), ws.id)).rejects.toMatchObject({
            status: 403
        });
        await expect(workspaces.deleteWorkspace(me('owen'), ws.id)).rejects.toMatchObject({
            code: 'WORKSPACE_NOT_EMPTY'
        });
        await projects.deleteProject(me('owen'), 'site');
        await workspaces.deleteWorkspace(me('owen'), ws.id);
        expect(workspaces.getWorkspace(ws.id)).toBeUndefined();
    });
    it('moves a project to another workspace its admin is in, and only then', async () => {
        const agency = await workspaces.createWorkspace(me('owen'), 'Agency');
        const client = await workspaces.createWorkspace(me('client'), 'Client Co');
        await workspaces.addWorkspaceMember(agency.id, 'ada', { role: 'member', access: 'all' });
        await projects.createProject(me('owen'), {
            id: 'site',
            label: 'Site',
            defaultLocale: 'en',
            workspaceId: agency.id
        });
        // Owen isn't in the client's workspace yet: it isn't there for him.
        await expect(projects.moveProject(me('owen'), 'site', client.id)).rejects.toMatchObject({
            status: 404
        });
        // A Member with every project can't hand one over.
        await workspaces.addWorkspaceMember(client.id, 'ada', { role: 'member' });
        await expect(projects.moveProject(me('ada'), 'site', client.id)).rejects.toMatchObject({
            status: 403
        });
        await workspaces.addWorkspaceMember(client.id, 'owen', { role: 'admin' });
        const moved = await projects.moveProject(me('owen'), 'site', client.id);
        expect(moved.workspaceId).toBe(client.id);
        expect(workspaces.projectsInWorkspace(agency.id)).toEqual([]);
        // The client's team is in it now; the agency's "all" Member no longer is.
        expect(projects.getProjectIdsForUser('client')).toEqual(['site']);
        expect(projects.getProjectIdsForUser('ada')).toEqual([]);
    });

    it('takes whoever leaves the team out of all its projects', async () => {
        const ws = await workspaces.createWorkspace(me('owen'), 'Agency');
        await workspaces.addWorkspaceMember(ws.id, 'theo', { role: 'member' });
        await projects.createProject(me('owen'), {
            id: 'site',
            label: 'Site',
            defaultLocale: 'en',
            workspaceId: ws.id
        });
        await projects.addProjectMember('site', me('theo'), ['writer']);
        expect(projects.getProjectIdsForUser('theo')).toEqual(['site']);
        await workspaces.removeWorkspaceMember(me('owen'), ws.id, 'theo');
        expect(projects.getProjectIdsForUser('theo')).toEqual([]);
        const project = (await projects.getProjectById('site'))!;
        expect(project.users).not.toContain('theo');
        expect(project.memberRoles?.theo).toBeUndefined();
    });

    it('keeps workspace invites apart from project invites', async () => {
        const ws = await workspaces.createWorkspace(me('owen'), 'Agency');
        await projects.createProject(me('owen'), {
            id: 'site',
            label: 'Site',
            defaultLocale: 'en',
            workspaceId: ws.id
        });
        const forProject = invites.createInvite({
            projectId: 'site',
            email: 'new@agency.test',
            roles: ['writer'],
            invitedBy: 'owen'
        });
        const forTeam = invites.createWorkspaceInvite({
            workspaceId: ws.id,
            email: 'New@agency.test',
            member: { role: 'member', access: 'all' },
            invitedBy: 'owen'
        });
        expect(invites.listInvites('site').map(i => i.id)).toEqual([forProject.invite.id]);
        expect(invites.listWorkspaceInvites(ws.id).map(i => i.id)).toEqual([forTeam.invite.id]);
        const found = invites.findInviteByToken(forTeam.token)!;
        expect(invites.isWorkspaceInvite(found)).toBe(true);
        expect(invites.revokeInvite('site', forTeam.invite.id)).toBe(false);
        expect(invites.hasLiveInvite('new@agency.test')).toBe(true);
        await projects.deleteProject(me('owen'), 'site');
        await workspaces.deleteWorkspace(me('owen'), ws.id);
        expect(invites.findInviteByToken(forTeam.token)).toBeNull();
        expect(invites.findInviteByToken(forProject.token)).not.toBeNull();
    });
});
