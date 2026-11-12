import { hasRole, inProject, isInProject, rolesInProject } from '@moteurio/types';
import type { ActivityEvent } from '@moteurio/types/Activity.js';
import type { ProjectSchema } from '@moteurio/types/Project.js';
import type { User } from '@moteurio/types/User.js';
import { connectedProviders } from './accountConnections.js';
import { getGlobalLog, GLOBAL_PROJECT_ID } from './activityLogger.js';
import { listAuthSessions } from './authSessions.js';
import { withdrawInvitesBy } from './invites.js';
import { deleteProject, loadProjects, updateProject } from './projects.js';
import { hasTwoFactor } from './twoFactor.js';
import {
    projectsInWorkspace,
    removeEmptyWorkspace,
    removeWorkspaceMember,
    workspaceOf,
    workspacesOf
} from './workspaces.js';
import { deleteUser, getUserById, reloadUsers, withoutSecrets } from './users.js';
import { triggerEvent } from './utils/eventBus.js';
import { getProjectJson } from './utils/projectStorage.js';
import { ACTIVITY_KEY } from './utils/storageKeys.js';

/**
 * A person's own account, as they can take it with them or end it (Quebec's Law 25, GDPR): what
 * the server keeps about them, in one file, and what deleting the account does to each project.
 * Content they wrote belongs to its project: it stays there, credited by name, and the project's
 * admins export it with the project.
 */

/** Activity logs keep at most their last 10,000 events, so the export cannot reach further back. */
const ACTIVITY_WINDOW = 10_000;

export type ProjectRef = { id: string; name: string };

const ref = (p: ProjectSchema): ProjectRef => ({ id: p.id, name: p.label || p.id });
/** True when the user is listed on the project itself (including guests), not only through its workspace. */
const memberOf = (p: ProjectSchema, userId: string) =>
    Array.isArray(p.users) && (p.users as string[]).includes(userId);

/** Every user in the project: its own members plus those who have access through its workspace. */
function peopleIn(project: ProjectSchema): string[] {
    const workspace = workspaceOf(project);
    const ids = new Set([
        ...((project.users ?? []) as string[]),
        ...Object.keys(workspace?.members ?? {})
    ]);
    return [...ids].filter(id => isInProject(id, project, workspace));
}

function account(userId: string): User {
    reloadUsers();
    const user = getUserById(userId);
    if (!user?.isActive) throw Object.assign(new Error('Account unavailable'), { status: 401 });
    return user;
}

/** An activity event without its before/after content, which belongs to the project, not the person. */
function slim(event: ActivityEvent) {
    const { before: _before, after: _after, ...rest } = event;
    return rest;
}

/**
 * Everything the server keeps about this person, for them to download: the account (no
 * password hash, no two-step secret), how they sign in, their sessions, their projects and their
 * roles there, and what they did, from each project's activity log and the server's.
 */
export async function accountExport(userId: string, currentSessionId?: string) {
    const user = account(userId);
    const {
        auth: _auth,
        authVersion: _version,
        projects: _projects,
        twoFactor: _twoFactor,
        agent: _agent,
        ...rest
    } = withoutSecrets(user);
    const projects = loadProjects().filter(p => isInProject(userId, p, workspaceOf(p)));
    const activity: ReturnType<typeof slim>[] = [];
    for (const project of projects) {
        const events = (await getProjectJson<ActivityEvent[]>(project.id, ACTIVITY_KEY)) ?? [];
        if (Array.isArray(events))
            activity.push(...events.filter(e => e.userId === userId).map(slim));
    }
    const global = await getGlobalLog(ACTIVITY_WINDOW);
    activity.push(
        ...global.events
            .filter(
                e => e.userId === userId || (e.resourceType === 'user' && e.resourceId === userId)
            )
            .map(e => slim({ ...e, projectId: e.projectId || GLOBAL_PROJECT_ID }))
    );
    activity.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    return {
        exportedAt: new Date().toISOString(),
        account: rest,
        signIn: {
            password: Boolean(user.passwordHash),
            providers: connectedProviders(user),
            twoFactor: hasTwoFactor(user)
        },
        sessions: listAuthSessions(userId, user.authVersion ?? 0).map(session => ({
            id: session.id,
            label: session.label,
            kind: session.kind,
            createdAt: new Date(session.createdAt).toISOString(),
            expiresAt: new Date(session.expiresAt).toISOString(),
            current: session.id === currentSessionId
        })),
        projects: projects.map(p => ({
            ...ref(p),
            roles: rolesInProject(user, p, workspaceOf(p))
        })),
        workspaces: workspacesOf(userId).map(w => ({
            id: w.id,
            name: w.name,
            role: w.members[userId].role
        })),
        activity
    };
}

export type AccountDeletion = {
    /** Projects where the user is the only member. They move to the server's project trash with the account. */
    deletes: ProjectRef[];
    /** Projects with other members and another admin. The user leaves; their content stays, credited by name. */
    leaves: ProjectRef[];
    /** Projects with other members where the user is the only admin. Another member must be made admin first. */
    blocked: ProjectRef[];
    workspaces: {
        /** Workspaces where the user is the only member and all of whose projects are deleted. The workspace is deleted too. */
        deletes: ProjectRef[];
        /** Workspaces with other members. The user leaves. */
        leaves: ProjectRef[];
        /**
         * Workspaces where the user is the only owner and other members remain, or where a project
         * stays because someone else is in it. Another member must become owner first, or the
         * project must be moved.
         */
        blocked: ProjectRef[];
    };
};

/** What deleting this account would do to each of its projects and workspaces. */
export function accountDeletion(userId: string): AccountDeletion {
    const user = account(userId);
    const plan: AccountDeletion = {
        deletes: [],
        leaves: [],
        blocked: [],
        workspaces: { deletes: [], leaves: [], blocked: [] }
    };
    for (const project of loadProjects().filter(p => memberOf(p, userId))) {
        const workspace = workspaceOf(project);
        // peopleIn also counts workspace members, who are not listed on the project itself.
        const others = peopleIn(project)
            .filter(id => id !== userId)
            .map(id => getUserById(id))
            .filter((u): u is User => Boolean(u));
        if (!others.length) plan.deletes.push(ref(project));
        else if (others.some(u => hasRole(inProject(u, project, workspace), 'admin')))
            plan.leaves.push(ref(project));
        else if (hasRole(inProject(user, project, workspace), 'admin'))
            plan.blocked.push(ref(project));
        // Nobody is an admin, so the user leaving does not change who can manage the project.
        else plan.leaves.push(ref(project));
    }
    const going = new Set(plan.deletes.map(p => p.id));
    for (const workspace of workspacesOf(userId)) {
        const wsRef = { id: workspace.id, name: workspace.name };
        const others = Object.keys(workspace.members).filter(id => id !== userId);
        if (others.length) {
            const otherOwner = others.some(id => workspace.members[id].role === 'owner');
            const isOwner = workspace.members[userId].role === 'owner';
            (isOwner && !otherOwner ? plan.workspaces.blocked : plan.workspaces.leaves).push(wsRef);
        } else if (projectsInWorkspace(workspace.id).every(p => going.has(p.id))) {
            plan.workspaces.deletes.push(wsRef);
        } else plan.workspaces.blocked.push(wsRef);
    }
    return plan;
}

/**
 * Delete this person's account, for good. `confirmEmail` is their address typed back. Refused
 * (409 `SOLE_ADMIN`, with `projects`) while they are the only admin of a project others are in,
 * and (409 `SOLE_OWNER`, with `workspaces`) while they are the only owner of a workspace others
 * are in. Projects only they are in go to the project trash; they leave the others; workspaces
 * only they are in go once their projects have; the invites they sent are withdrawn; every
 * session ends; the account leaves the users file.
 */
export async function deleteAccount(
    userId: string,
    confirmEmail: string
): Promise<AccountDeletion & { invitesWithdrawn: number }> {
    const user = account(userId);
    if (confirmEmail.trim().toLowerCase() !== user.email.trim().toLowerCase())
        throw Object.assign(new Error('Type your sign-in email to confirm.'), {
            status: 400,
            code: 'CONFIRM_MISMATCH'
        });
    const plan = accountDeletion(userId);
    if (plan.blocked.length)
        throw Object.assign(
            new Error('Make someone else an admin of these projects first, or remove the others.'),
            { status: 409, code: 'SOLE_ADMIN', projects: plan.blocked }
        );
    if (plan.workspaces.blocked.length)
        throw Object.assign(
            new Error(
                'Make someone else an owner of these workspaces first, or move their projects.'
            ),
            { status: 409, code: 'SOLE_OWNER', workspaces: plan.workspaces.blocked }
        );
    for (const { id } of plan.deletes) await deleteProject(user, id);
    for (const { id } of plan.leaves) {
        const project = loadProjects().find(p => p.id === id);
        if (!project) continue;
        const memberRoles = { ...project.memberRoles };
        delete memberRoles[userId];
        await updateProject(user, id, {
            users: (project.users as string[]).filter(u => u !== userId),
            memberRoles
        });
    }
    for (const { id } of plan.workspaces.leaves) await removeWorkspaceMember(user, id, userId);
    for (const { id } of plan.workspaces.deletes) await removeEmptyWorkspace(id);
    const invitesWithdrawn = withdrawInvitesBy(userId);
    await deleteUser(userId);
    await triggerEvent('auth.account.deleted', { userId, email: user.email });
    return { ...plan, invitesWithdrawn };
}
