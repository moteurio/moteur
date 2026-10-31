import { hasRole, inProject, rolesInProject } from '@moteurio/types';
import type { ActivityEvent } from '@moteurio/types/Activity.js';
import type { ProjectSchema } from '@moteurio/types/Project.js';
import type { User } from '@moteurio/types/User.js';
import { connectedProviders } from './accountConnections.js';
import { getGlobalLog, GLOBAL_PROJECT_ID } from './activityLogger.js';
import { listAuthSessions } from './authSessions.js';
import { withdrawInvitesBy } from './invites.js';
import { deleteProject, loadProjects, updateProject } from './projects.js';
import { hasTwoFactor } from './twoFactor.js';
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

/** As far back as the activity logs go: each keeps its last 10,000 events. */
const ACTIVITY_WINDOW = 10_000;

export type ProjectRef = { id: string; name: string };

const ref = (p: ProjectSchema): ProjectRef => ({ id: p.id, name: p.label || p.id });
const memberOf = (p: ProjectSchema, userId: string) =>
    Array.isArray(p.users) && (p.users as string[]).includes(userId);

function account(userId: string): User {
    reloadUsers();
    const user = getUserById(userId);
    if (!user?.isActive) throw Object.assign(new Error('Account unavailable'), { status: 401 });
    return user;
}

/** An activity event without the content it carried: that belongs to the project. */
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
    const projects = loadProjects().filter(p => memberOf(p, userId));
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
        projects: projects.map(p => ({ ...ref(p), roles: rolesInProject(user, p) })),
        activity
    };
}

export type AccountDeletion = {
    /** Only they are in it: it goes to the server's project trash with the account. */
    deletes: ProjectRef[];
    /** Others are in it, and another admin: they leave, their content stays credited by name. */
    leaves: ProjectRef[];
    /** Others are in it and they are its only admin: someone else must be made admin first. */
    blocked: ProjectRef[];
};

/** What deleting this account would do to each of its projects. */
export function accountDeletion(userId: string): AccountDeletion {
    const user = account(userId);
    const plan: AccountDeletion = { deletes: [], leaves: [], blocked: [] };
    for (const project of loadProjects().filter(p => memberOf(p, userId))) {
        const others = (project.users as string[])
            .filter(id => id !== userId)
            .map(id => getUserById(id))
            .filter((u): u is User => Boolean(u));
        if (!others.length) plan.deletes.push(ref(project));
        else if (others.some(u => hasRole(inProject(u, project), 'admin')))
            plan.leaves.push(ref(project));
        else if (hasRole(inProject(user, project), 'admin')) plan.blocked.push(ref(project));
        // No admin at all: leaving changes nothing about who can run it.
        else plan.leaves.push(ref(project));
    }
    return plan;
}

/**
 * Delete this person's account, for good. `confirmEmail` is their address typed back. Refused
 * (409 `SOLE_ADMIN`, with `projects`) while they are the only admin of a project others are in.
 * Projects only they are in go to the project trash; they leave the others; the invites they
 * sent are withdrawn; every session ends; the account leaves the users file.
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
    const invitesWithdrawn = withdrawInvitesBy(userId);
    await deleteUser(userId);
    await triggerEvent('auth.account.deleted', { userId, email: user.email });
    return { ...plan, invitesWithdrawn };
}
