/**
 * Workspaces: the teams that own projects (see `Workspace` in @moteurio/types for what each role
 * brings). Kept in one private file next to the users (`storageConfig.workspacesFile`), written
 * whole and atomically, one write at a time. A project names its workspace
 * (`ProjectSchema.workspaceId`); the workspace doesn't list its projects, so there is one place
 * to look.
 */
import { randomBytes } from 'node:crypto';
import {
    canStartProjectIn,
    runsWorkspace,
    WORKSPACE_ROLES,
    type Workspace,
    type WorkspaceAccess,
    type WorkspaceMember,
    type WorkspaceRole
} from '@moteurio/types/Workspace.js';
import { normalizeStoredRoles, ROLE_SLUGS } from '@moteurio/types';
import type { User } from '@moteurio/types/User.js';
import { storageConfig } from './config/storageConfig.js';
import { leaveWorkspaceProjects, loadProjects } from './projects.js';
import { readPrivateState, writePrivateState } from './utils/privateStore.js';
import { withWriteLock } from './utils/projectWriteLock.js';
import { triggerEvent } from './utils/eventBus.js';
import { withdrawWorkspaceInvites } from './invites.js';

type WorkspacesFile = { workspaces: Workspace[] };

const NAME_MAX = 120;

const fail = (message: string, status: number, code?: string) =>
    Object.assign(new Error(message), { status, statusCode: status, ...(code && { code }) });

let cache: { file: string; data: WorkspacesFile } | null = null;

function file(): string {
    return storageConfig.workspacesFile;
}

function read(): WorkspacesFile {
    const at = file();
    if (cache?.file === at) return cache.data;
    const data = readPrivateState<WorkspacesFile>(at, { workspaces: [] });
    if (!Array.isArray(data.workspaces)) throw new Error('Workspaces file could not be read');
    cache = { file: at, data };
    return data;
}

function save(data: WorkspacesFile): void {
    writePrivateState(file(), data);
    cache = { file: file(), data };
}

/** Change the file under the write lock, from what is on disk now. */
function change<T>(work: (data: WorkspacesFile) => T): Promise<T> {
    return withWriteLock(file(), async () => {
        cache = null;
        const data = read();
        const result = work(data);
        save(data);
        return result;
    });
}

/** Forget what was read (another process wrote the file, or a test moved it). */
export function reloadWorkspaces(): void {
    cache = null;
}

export function listWorkspaces(): Workspace[] {
    return read().workspaces;
}

export function getWorkspace(id: string | undefined | null): Workspace | undefined {
    if (!id) return undefined;
    return read().workspaces.find(w => w.id === id);
}

/** The workspace a project belongs to. */
export function workspaceOf(project: { workspaceId?: string } | null | undefined) {
    return getWorkspace(project?.workspaceId);
}

/** The workspaces someone is a member of (not those where they are only a project's guest). */
export function workspacesOf(userId: string): Workspace[] {
    return read().workspaces.filter(w => !!w.members?.[userId]);
}

/** Someone's own workspace, if they have one yet. */
export function personalWorkspaceOf(userId: string): Workspace | undefined {
    return read().workspaces.find(w => w.personal?.userId === userId);
}

function newId(): string {
    return `ws_${randomBytes(9)
        .toString('base64url')
        .replace(/[^A-Za-z0-9]/g, '0')}`;
}

function cleanName(name: unknown): string {
    const value = typeof name === 'string' ? name.trim() : '';
    if (!value) throw fail('A workspace needs a name.', 400, 'WORKSPACE_NAME');
    return value.slice(0, NAME_MAX);
}

function made(user: Pick<User, 'id'>, name: string, personal: boolean): Workspace {
    const now = new Date().toISOString();
    return {
        id: newId(),
        name,
        ...(personal && { personal: { userId: user.id } }),
        createdAt: now,
        createdBy: user.id,
        members: { [user.id]: { role: 'owner', joinedAt: now } }
    };
}

/** A new workspace, with its maker as its owner. */
export async function createWorkspace(user: User, name: string): Promise<Workspace> {
    if (!user?.id || !user.isActive) throw fail('Sign in to start a workspace.', 401);
    const workspace = made(user, cleanName(name), false);
    await change(data => void data.workspaces.push(workspace));
    triggerEvent('workspace.afterCreate', { workspace, user });
    return workspace;
}

/**
 * Someone's own workspace, made the first time they need one (their first project). Its name is
 * theirs; a Studio may show it as "Personal".
 */
export async function ensurePersonalWorkspace(user: User): Promise<Workspace> {
    const existing = personalWorkspaceOf(user.id);
    if (existing) return existing;
    let createdNow: Workspace | undefined;
    const workspace = await change(data => {
        const there = data.workspaces.find(w => w.personal?.userId === user.id);
        if (there) return there;
        createdNow = made(user, (user.name || user.email || user.id).slice(0, NAME_MAX), true);
        data.workspaces.push(createdNow);
        return createdNow;
    });
    if (createdNow) triggerEvent('workspace.afterCreate', { workspace, user });
    return workspace;
}

/**
 * The workspace a new project of this person's goes in: the one asked for, if they may start
 * projects there, else their own.
 */
export async function workspaceForNewProject(user: User, workspaceId?: string): Promise<Workspace> {
    if (!workspaceId) return ensurePersonalWorkspace(user);
    const workspace = getWorkspace(workspaceId);
    if (!workspace || !workspace.members?.[user.id])
        throw fail(`Workspace "${workspaceId}" not found.`, 404, 'WORKSPACE_NOT_FOUND');
    if (!canStartProjectIn(workspace, user.id))
        throw fail('Only its owners, admins and members start projects in a workspace.', 403);
    return workspace;
}

function roleOf(workspace: Workspace, userId: string): WorkspaceRole | undefined {
    return workspace.members?.[userId]?.role;
}

function owners(workspace: Workspace): string[] {
    return Object.entries(workspace.members ?? {})
        .filter(([, m]) => m.role === 'owner')
        .map(([id]) => id);
}

function mustGet(data: WorkspacesFile, id: string): Workspace {
    const workspace = data.workspaces.find(w => w.id === id);
    if (!workspace) throw fail(`Workspace "${id}" not found.`, 404, 'WORKSPACE_NOT_FOUND');
    return workspace;
}

/** Only owners and admins manage a workspace; only owners touch owners. */
function assertManages(workspace: Workspace, actorId: string, target?: WorkspaceRole): void {
    const role = roleOf(workspace, actorId);
    if (!runsWorkspace(role))
        throw fail('Only the workspace’s owners and admins can do this.', 403);
    if (target === 'owner' && role !== 'owner')
        throw fail('Only an owner can make or change an owner.', 403);
}

/** Throws unless this person may manage the workspace (and, for `target: 'owner'`, owners). */
export function assertManagesWorkspace(
    workspace: Workspace,
    actorId: string,
    target?: WorkspaceRole
): void {
    assertManages(workspace, actorId, target);
}

export type MemberInput = {
    role: WorkspaceRole;
    access?: WorkspaceAccess;
    projectRoles?: string[];
};

function member(input: MemberInput, joinedAt: string): WorkspaceMember {
    if (!WORKSPACE_ROLES.includes(input.role))
        throw fail(`Unknown workspace role "${String(input.role)}".`, 400, 'WORKSPACE_ROLE');
    if (input.role !== 'member') return { role: input.role, joinedAt };
    const access = input.access ?? 'chosen';
    if (access !== 'all' && access !== 'chosen')
        throw fail(`Access is "all" or "chosen", not "${String(access)}".`, 400);
    const projectRoles = input.projectRoles?.length
        ? normalizeStoredRoles(input.projectRoles)
        : undefined;
    const unknown = projectRoles?.find(r => !(ROLE_SLUGS as readonly string[]).includes(r));
    if (unknown) throw fail(`Unknown role "${unknown}".`, 400, 'ROLE');
    return {
        role: 'member',
        access,
        ...(access === 'all' && projectRoles && { projectRoles }),
        joinedAt
    };
}

/** A member's place as it would be kept: checked, and Member-only settings dropped otherwise. */
export function cleanMemberInput(input: MemberInput): MemberInput {
    const { joinedAt: _joined, ...kept } = member(input, '');
    return kept;
}

/**
 * Make someone a member (accepting an invite, say). Callers decide whether they may join; an
 * existing member keeps their place and gets this role. A Member's access defaults to "chosen".
 */
export async function addWorkspaceMember(
    workspaceId: string,
    userId: string,
    input: MemberInput
): Promise<Workspace> {
    const workspace = await change(data => {
        const ws = mustGet(data, workspaceId);
        const joinedAt = ws.members[userId]?.joinedAt ?? new Date().toISOString();
        if (ws.members[userId]?.role === 'owner' && input.role !== 'owner' && owners(ws).length < 2)
            throw fail('A workspace always has an owner.', 409, 'LAST_OWNER');
        ws.members[userId] = member(input, joinedAt);
        return ws;
    });
    triggerEvent('workspace.afterUpdate', { workspace });
    return workspace;
}

/** Change a member's role or access, as an owner or admin of the workspace. */
export async function updateWorkspaceMember(
    actor: User,
    workspaceId: string,
    userId: string,
    input: MemberInput
): Promise<Workspace> {
    const workspace = await change(data => {
        const ws = mustGet(data, workspaceId);
        const current = ws.members[userId];
        if (!current) throw fail('Not a member of this workspace.', 404);
        assertManages(ws, actor.id, current.role === 'owner' ? 'owner' : input.role);
        if (current.role === 'owner' && input.role !== 'owner' && owners(ws).length < 2)
            throw fail(
                'A workspace always has an owner: make someone else one first.',
                409,
                'LAST_OWNER'
            );
        ws.members[userId] = member(input, current.joinedAt);
        return ws;
    });
    triggerEvent('workspace.afterUpdate', { workspace, user: actor });
    return workspace;
}

/**
 * Take someone out of the workspace (or leave it, as yourself). They leave its projects too, even
 * those they were added to one by one: whoever leaves a team leaves its work.
 */
export async function removeWorkspaceMember(
    actor: User,
    workspaceId: string,
    userId: string
): Promise<Workspace> {
    const workspace = await change(data => {
        const ws = mustGet(data, workspaceId);
        const current = ws.members[userId];
        if (!current) throw fail('Not a member of this workspace.', 404);
        if (actor.id !== userId) assertManages(ws, actor.id, current.role);
        if (current.role === 'owner' && owners(ws).length < 2)
            throw fail(
                'A workspace always has an owner: make someone else one first.',
                409,
                'LAST_OWNER'
            );
        delete ws.members[userId];
        return ws;
    });
    await leaveWorkspaceProjects(workspaceId, userId, actor);
    triggerEvent('workspace.afterUpdate', { workspace, user: actor });
    return workspace;
}

/** Rename a workspace, as one of its owners or admins. */
export async function renameWorkspace(actor: User, workspaceId: string, name: string) {
    const clean = cleanName(name);
    const workspace = await change(data => {
        const ws = mustGet(data, workspaceId);
        assertManages(ws, actor.id);
        ws.name = clean;
        return ws;
    });
    triggerEvent('workspace.afterUpdate', { workspace, user: actor });
    return workspace;
}

/** The projects in a workspace. */
export function projectsInWorkspace(workspaceId: string) {
    return loadProjects().filter(p => p.workspaceId === workspaceId);
}

/**
 * Delete a workspace, as one of its owners, once it has no projects: they are moved or deleted
 * first, so no project is ever left without one.
 */
export async function deleteWorkspace(actor: User, workspaceId: string): Promise<void> {
    const ws = getWorkspace(workspaceId);
    if (!ws) throw fail(`Workspace "${workspaceId}" not found.`, 404, 'WORKSPACE_NOT_FOUND');
    if (roleOf(ws, actor.id) !== 'owner') throw fail('Only an owner can delete a workspace.', 403);
    await removeEmptyWorkspace(workspaceId);
    triggerEvent('workspace.afterDelete', { workspace: ws, user: actor });
}

/** Remove a workspace with no projects (no checks of who asks: callers decide). */
export async function removeEmptyWorkspace(workspaceId: string): Promise<void> {
    if (projectsInWorkspace(workspaceId).length)
        throw fail('Move or delete its projects first.', 409, 'WORKSPACE_NOT_EMPTY');
    await change(data => {
        data.workspaces = data.workspaces.filter(w => w.id !== workspaceId);
    });
    withdrawWorkspaceInvites(workspaceId);
}
