/**
 * A workspace: the team that owns projects (an agency, a studio, one person). Every project
 * belongs to exactly one (`ProjectSchema.workspaceId`). Its members are the team; a client is
 * not a member but a guest of their own project (`ProjectSchema.users`), so they never see the
 * team's other projects.
 *
 * What each workspace role brings:
 * - Owner runs the workspace (its name, its owners, deleting it) and is Admin, Billing and
 *   Developer in every project of it.
 * - Admin manages the members and is Admin and Developer in every project of it.
 * - Billing pays for it: Billing in every project of it, nothing more.
 * - Member starts projects in it. With `access: 'all'` they are in every project, with
 *   `projectRoles` (Writer when none); with `access: 'chosen'`, only in projects they were
 *   added to, as any project member.
 *
 * A project's own roles for someone (`ProjectSchema.memberRoles`) win over what the workspace
 * gives a Member or Billing person. Owners and Admins keep their workspace roles in every
 * project whatever the project says: nobody is locked out of their own team's work.
 */
import type { RoleSlug } from './platformRoles.js';

export const WORKSPACE_ROLES = ['owner', 'admin', 'billing', 'member'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

/** Which of the workspace's projects a Member is in: every one, or those they were added to. */
export type WorkspaceAccess = 'all' | 'chosen';

export interface WorkspaceMember {
    role: WorkspaceRole;
    /** Members only (owners, admins and billing see every project). */
    access?: WorkspaceAccess;
    /** A Member's roles in every project, with `access: 'all'`. Writer when none. */
    projectRoles?: string[];
    joinedAt: string;
}

export interface Workspace {
    /** `ws_` and letters and digits. */
    id: string;
    name: string;
    /** Someone's own workspace, made with their first project. Only they are in it at first. */
    personal?: { userId: string };
    createdAt: string;
    createdBy: string;
    /** By user id. Always at least one owner. */
    members: Record<string, WorkspaceMember>;
}

/** The roles a workspace role gives in every project of the workspace. */
const ROLES_FROM_WORKSPACE: Record<Exclude<WorkspaceRole, 'member'>, readonly RoleSlug[]> = {
    owner: ['admin', 'billing', 'developer'],
    admin: ['admin', 'developer'],
    billing: ['billing']
};

/** Whether this role sees every project of the workspace, whatever the project says. */
export function runsWorkspace(role: WorkspaceRole | undefined): boolean {
    return role === 'owner' || role === 'admin';
}

/**
 * The roles a person has in every project of this workspace because they are in it; null when
 * the workspace gives them no project (not a member, or a Member with `access: 'chosen'`).
 */
export function workspaceProjectRoles(
    workspace: Pick<Workspace, 'members'> | null | undefined,
    userId: string | undefined
): string[] | null {
    const member = userId ? workspace?.members?.[userId] : undefined;
    if (!member) return null;
    if (member.role === 'member') {
        if (member.access !== 'all') return null;
        return member.projectRoles?.length ? [...member.projectRoles] : ['writer'];
    }
    return [...(ROLES_FROM_WORKSPACE[member.role] ?? [])];
}

/** Whether this person may start a project in the workspace (Billing pays, it doesn't build). */
export function canStartProjectIn(
    workspace: Pick<Workspace, 'members'> | null | undefined,
    userId: string
): boolean {
    const role = workspace?.members?.[userId]?.role;
    return role === 'owner' || role === 'admin' || role === 'member';
}

/** A workspace as `GET /workspaces` lists it: with your place in it, and how big it is. */
export interface WorkspaceSummary {
    id: string;
    name: string;
    personal: boolean;
    createdAt: string;
    /** Your role in it. */
    role: WorkspaceRole;
    /** Yours, as a Member. */
    access?: WorkspaceAccess;
    /** Yours in every project, as a Member with `access: 'all'`. */
    projectRoles?: string[];
    /** How many people are in it. */
    members: number;
    /** How many projects it has. */
    projects: number;
}

/**
 * Your place in a workspace as `workspaceProjectRoles` reads it, from what `GET /workspaces` says
 * of you: to work out your roles in its projects without the whole workspace.
 */
export function asOwnWorkspace(
    summary: Pick<WorkspaceSummary, 'role' | 'access' | 'projectRoles'> | null | undefined,
    userId: string
): Pick<Workspace, 'members'> | undefined {
    if (!summary?.role) return undefined;
    return {
        members: {
            [userId]: {
                role: summary.role,
                ...(summary.access && { access: summary.access }),
                ...(summary.projectRoles && { projectRoles: summary.projectRoles }),
                joinedAt: ''
            }
        }
    };
}

/** Someone in a workspace, as `GET /workspaces/:id` shows them. */
export interface WorkspacePerson {
    id: string;
    name?: string;
    email?: string;
    avatar?: string;
    role: WorkspaceRole;
    access?: WorkspaceAccess;
    projectRoles?: string[];
    joinedAt: string;
}

/** A workspace and its people (`GET /workspaces/:id`). */
export interface WorkspaceDetail extends WorkspaceSummary {
    people: WorkspacePerson[];
}

/** A pending invite into a workspace. */
export interface WorkspaceInviteRow {
    id: string;
    email: string;
    role: WorkspaceRole;
    access?: WorkspaceAccess;
    projectRoles?: string[];
    invitedBy?: { id: string; name?: string };
    note?: string;
    createdAt: string;
    expiresAt: string;
}

/** The place someone is given in a workspace (members, invites). */
export interface WorkspacePlace {
    role: WorkspaceRole;
    /** Members: every project, or only those they are added to (default). */
    access?: WorkspaceAccess;
    /** Members with `access: 'all'`: their roles in every project (Writer when none). */
    projectRoles?: string[];
}
