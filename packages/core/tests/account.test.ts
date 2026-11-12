import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type Project = {
    id: string;
    workspaceId?: string;
    label: string;
    users: string[];
    memberRoles?: Record<string, string[]>;
};
const store = vi.hoisted(() => ({
    projects: [] as Project[],
    deleted: [] as string[],
    updated: [] as [string, Partial<Project>][],
    activity: {} as Record<string, unknown[]>,
    global: [] as unknown[]
}));
vi.mock('../src/projects.js', () => ({
    loadProjects: () => store.projects,
    deleteProject: async (_user: unknown, id: string) => {
        store.deleted.push(id);
        store.projects = store.projects.filter(p => p.id !== id);
    },
    updateProject: async (_user: unknown, id: string, patch: Partial<Project>) => {
        store.updated.push([id, patch]);
    }
}));
vi.mock('../src/utils/projectStorage.js', () => ({
    getProjectJson: async (projectId: string) => store.activity[projectId] ?? null
}));
vi.mock('../src/activityLogger.js', () => ({
    GLOBAL_PROJECT_ID: '_system',
    getGlobalLog: async () => ({ events: store.global })
}));

const { accountDeletion, accountExport, deleteAccount } = await import('../src/account.js');
const { getUserById, reloadUsers } = await import('../src/users.js');
const { createAuthSession, listAuthSessions } = await import('../src/authSessions.js');
const { createInvite, listInvites } = await import('../src/invites.js');
const { onEvent } = await import('../src/utils/eventBus.js');
const { reloadWorkspaces } = await import('../src/workspaces.js');

const person = (id: string, email: string, extra: object = {}) => ({
    id,
    email,
    name: id,
    isActive: true,
    roles: [],
    projects: [],
    ...extra
});

describe('a person’s own account: export and deletion', () => {
    let root: string;
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-account-'));
        vi.stubEnv('AUTH_USERS_FILE', path.join(root, 'users.json'));
        vi.stubEnv('AUTH_SESSIONS_FILE', path.join(root, 'sessions.json'));
        vi.stubEnv('DATA_ROOT', root);
        fs.writeFileSync(
            path.join(root, 'users.json'),
            JSON.stringify([
                person('louise', 'louise@agency.test', {
                    passwordHash: '$2b$10$secret',
                    auth: { githubId: 42 },
                    twoFactor: { secret: 'sealed', enabledAt: 'x', recoveryCodes: [] },
                    signup: { at: '2026-01-01T00:00:00Z', method: 'email' },
                    onboarding: { intent: 'agency' }
                }),
                person('theo', 'theo@agency.test'),
                person('camille', 'camille@client.test')
            ])
        );
        reloadUsers();
        store.projects = [
            { id: 'solo', label: 'Solo', users: ['louise'], memberRoles: { louise: ['admin'] } },
            {
                id: 'shared',
                label: 'Shared',
                users: ['louise', 'theo'],
                memberRoles: { louise: ['admin'], theo: ['admin'] }
            },
            {
                id: 'mine',
                label: 'Mine',
                users: ['louise', 'camille'],
                memberRoles: { louise: ['admin'], camille: ['writer'] }
            },
            { id: 'other', label: 'Other', users: ['theo'] }
        ];
        store.deleted = [];
        store.updated = [];
        store.activity = {
            shared: [
                {
                    id: 'a1',
                    projectId: 'shared',
                    userId: 'louise',
                    userName: 'louise',
                    action: 'updated',
                    resourceType: 'entry',
                    resourceId: 'post__1',
                    before: { title: 'Old' },
                    after: { title: 'New' },
                    timestamp: '2026-02-01T00:00:00Z'
                },
                {
                    id: 'a2',
                    projectId: 'shared',
                    userId: 'theo',
                    userName: 'theo',
                    action: 'created',
                    resourceType: 'entry',
                    resourceId: 'post__2',
                    timestamp: '2026-02-02T00:00:00Z'
                }
            ]
        };
        store.global = [
            {
                id: 'g1',
                projectId: '_system',
                userId: 'system',
                userName: 'System',
                action: 'created',
                resourceType: 'user',
                resourceId: 'louise',
                timestamp: '2026-01-01T00:00:00Z'
            }
        ];
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        reloadUsers();
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('exports the account without secrets, how they sign in, projects and what they did', async () => {
        const session = createAuthSession(getUserById('louise')!);
        const data = await accountExport('louise', session.id);
        expect(data.account).toMatchObject({
            id: 'louise',
            email: 'louise@agency.test',
            signup: { method: 'email' },
            onboarding: { intent: 'agency' }
        });
        for (const secret of ['passwordHash', 'twoFactor', 'auth', 'authVersion', 'projects'])
            expect(data.account).not.toHaveProperty(secret);
        expect(data.signIn).toEqual({ password: true, providers: ['github'], twoFactor: true });
        expect(data.sessions).toEqual([expect.objectContaining({ id: session.id, current: true })]);
        expect(data.projects).toEqual([
            { id: 'solo', name: 'Solo', roles: ['admin'] },
            { id: 'shared', name: 'Shared', roles: ['admin'] },
            { id: 'mine', name: 'Mine', roles: ['admin'] }
        ]);
        expect(data.activity.map(e => e.id)).toEqual(['g1', 'a1']);
        // What they did, not the content: that stays in the project.
        expect(data.activity[1]).not.toHaveProperty('before');
        expect(data.activity[1]).not.toHaveProperty('after');
    });

    it('says what deleting would do to each project', () => {
        expect(accountDeletion('louise')).toEqual({
            deletes: [{ id: 'solo', name: 'Solo' }],
            leaves: [{ id: 'shared', name: 'Shared' }],
            blocked: [{ id: 'mine', name: 'Mine' }],
            workspaces: { deletes: [], leaves: [], blocked: [] }
        });
    });

    it('takes their workspaces into account: leaves, deletes or refuses', async () => {
        const at = '2026-11-01T00:00:00Z';
        const ws = (id: string, members: Record<string, string>) => ({
            id,
            name: id,
            createdAt: at,
            createdBy: 'louise',
            members: Object.fromEntries(
                Object.entries(members).map(([u, role]) => [u, { role, joinedAt: at }])
            )
        });
        fs.writeFileSync(
            path.join(root, 'workspaces.json'),
            JSON.stringify({
                workspaces: [
                    ws('ws_own', { louise: 'owner' }),
                    ws('ws_team', { louise: 'owner', theo: 'owner' }),
                    ws('ws_agency', { louise: 'owner', camille: 'member' }),
                    ws('ws_kept', { louise: 'owner' })
                ]
            })
        );
        reloadWorkspaces();
        store.projects = store.projects.filter(p => p.id !== 'mine');
        store.projects[0] = { ...store.projects[0], workspaceId: 'ws_own' } as never;
        // A project of hers someone else is in (and runs) stays: its workspace can't go.
        store.projects[1] = { ...store.projects[1], workspaceId: 'ws_kept' } as never;
        expect(accountDeletion('louise').workspaces).toEqual({
            deletes: [{ id: 'ws_own', name: 'ws_own' }],
            leaves: [{ id: 'ws_team', name: 'ws_team' }],
            blocked: [
                { id: 'ws_agency', name: 'ws_agency' },
                { id: 'ws_kept', name: 'ws_kept' }
            ]
        });
        await expect(deleteAccount('louise', 'louise@agency.test')).rejects.toMatchObject({
            status: 409,
            code: 'SOLE_OWNER'
        });
        expect(store.deleted).toEqual([]);
    });

    it('never deletes a project their workspace’s team is in, nor counts that team out', async () => {
        const at = '2026-11-01T00:00:00Z';
        fs.writeFileSync(
            path.join(root, 'workspaces.json'),
            JSON.stringify({
                workspaces: [
                    {
                        id: 'ws_team',
                        name: 'Team',
                        createdAt: at,
                        createdBy: 'theo',
                        members: {
                            louise: { role: 'member', access: 'chosen', joinedAt: at },
                            theo: { role: 'owner', joinedAt: at }
                        }
                    }
                ]
            })
        );
        reloadWorkspaces();
        // Only Louise was added to these one by one; Theo runs their workspace.
        store.projects[0] = { ...store.projects[0], workspaceId: 'ws_team' } as never;
        store.projects[2] = { ...store.projects[2], workspaceId: 'ws_team' } as never;
        const plan = accountDeletion('louise');
        expect(plan.deletes).toEqual([]);
        expect(plan.blocked).toEqual([]);
        expect(plan.leaves.map(p => p.id).sort()).toEqual(['mine', 'shared', 'solo']);
        expect(plan.workspaces.leaves).toEqual([{ id: 'ws_team', name: 'Team' }]);
    });

    it('exports the projects their workspaces give them, and what they did there', async () => {
        const at = '2026-11-01T00:00:00Z';
        fs.writeFileSync(
            path.join(root, 'workspaces.json'),
            JSON.stringify({
                workspaces: [
                    {
                        id: 'ws_team',
                        name: 'Team',
                        createdAt: at,
                        createdBy: 'theo',
                        members: {
                            louise: { role: 'admin', joinedAt: at },
                            theo: { role: 'owner', joinedAt: at }
                        }
                    }
                ]
            })
        );
        reloadWorkspaces();
        store.projects[3] = { ...store.projects[3], workspaceId: 'ws_team' } as never;
        store.activity.other = [
            {
                id: 'a3',
                projectId: 'other',
                userId: 'louise',
                userName: 'louise',
                action: 'updated',
                resourceType: 'entry',
                resourceId: 'post__3',
                timestamp: '2026-02-03T00:00:00Z'
            }
        ];
        const data = await accountExport('louise');
        expect(data.projects.map(p => p.id)).toContain('other');
        expect(data.activity.map(e => e.id)).toContain('a3');
    });

    it('refuses while they are the only admin of a project others are in', async () => {
        await expect(deleteAccount('louise', 'louise@agency.test')).rejects.toMatchObject({
            status: 409,
            code: 'SOLE_ADMIN',
            projects: [{ id: 'mine', name: 'Mine' }]
        });
        expect(store.deleted).toEqual([]);
        expect(getUserById('louise')).toBeDefined();
    });

    it('needs their own address typed back', async () => {
        await expect(deleteAccount('louise', 'louise@other.test')).rejects.toMatchObject({
            status: 400,
            code: 'CONFIRM_MISMATCH'
        });
    });

    it('deletes what only they are in, leaves the rest, withdraws their invites, ends sessions', async () => {
        store.projects = store.projects.filter(p => p.id !== 'mine');
        createAuthSession(getUserById('louise')!);
        createInvite({ projectId: 'shared', email: 'new@x.test', roles: [], invitedBy: 'louise' });
        createInvite({ projectId: 'shared', email: 'two@x.test', roles: [], invitedBy: 'theo' });
        const heard: unknown[] = [];
        onEvent('auth.account.deleted', e => void heard.push(e));

        const done = await deleteAccount('louise', ' Louise@Agency.test ');
        expect(done.invitesWithdrawn).toBe(1);
        expect(store.deleted).toEqual(['solo']);
        expect(store.updated).toEqual([
            ['shared', { users: ['theo'], memberRoles: { theo: ['admin'] } }]
        ]);
        expect(listInvites('shared').map(i => i.email)).toEqual(['two@x.test']);
        reloadUsers();
        expect(getUserById('louise')).toBeUndefined();
        expect(getUserById('theo')).toBeDefined();
        expect(listAuthSessions('louise')).toEqual([]);
        expect(heard).toEqual([{ userId: 'louise', email: 'louise@agency.test' }]);
    });
});
