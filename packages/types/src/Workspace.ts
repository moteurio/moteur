/**
 * A workspace is the team that owns projects (an agency, a studio or a single person). Every
 * project belongs to exactly one workspace (`ProjectSchema.workspaceId`). The workspace members
 * are the team. A client is not a workspace member but a guest on their own project
 * (`ProjectSchema.users`), so they cannot see the team's other projects.
 *
 * Roles granted by each workspace role:
 * - Owner manages the workspace (its name, its owners, deleting it) and has the Admin, Billing and
 *   Developer roles in every project of the workspace.
 * - Admin manages the members and has the Admin and Developer roles in every project of the
 *   workspace.
 * - Billing manages payment and has only the Billing role in every project of the workspace.
 * - Member can create projects in the workspace. With `access: 'all'` the member is in every
 *   project with the roles in `projectRoles` (Writer when empty). With `access: 'chosen'` the
 *   member is only in projects they were added to, like any other project member.
 *
 * Roles set on a project (`ProjectSchema.memberRoles`) take precedence over the roles the workspace
 * grants a Member or Billing user. Owners and Admins keep their workspace roles in every project
 * regardless of the project's roles, so nobody is locked out of their own team's projects.
 */
import type { RoleSlug } from './platformRoles.js';

export const WORKSPACE_ROLES = ['owner', 'admin', 'billing', 'member'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

/** Which of the workspace's projects a Member can access: every project (`all`) or only those they were added to (`chosen`). */
export type WorkspaceAccess = 'all' | 'chosen';

export interface WorkspaceMember {
    role: WorkspaceRole;
    /** Applies to Members only. Owners, Admins and Billing users always have access to every project. */
    access?: WorkspaceAccess;
    /** The Member's roles in every project when `access` is `all`. Defaults to Writer when empty. */
    projectRoles?: string[];
    joinedAt: string;
}

export interface Workspace {
    /** Workspace ID: the prefix `ws_` followed by letters and digits. */
    id: string;
    name: string;
    /** Set on a user's personal workspace, which is created with their first project. Initially only that user is a member. */
    personal?: { userId: string };
    createdAt: string;
    createdBy: string;
    /** Members keyed by user ID. A workspace always has at least one owner. */
    members: Record<string, WorkspaceMember>;
}

/** The project roles each workspace role grants in every project of the workspace. */
const ROLES_FROM_WORKSPACE: Record<Exclude<WorkspaceRole, 'member'>, readonly RoleSlug[]> = {
    owner: ['admin', 'billing', 'developer'],
    admin: ['admin', 'developer'],
    billing: ['billing']
};

/** True when the workspace role (Owner or Admin) has access to every project of the workspace regardless of the project's own roles. */
export function runsWorkspace(role: WorkspaceRole | undefined): boolean {
    return role === 'owner' || role === 'admin';
}

/**
 * Returns the roles a user has in every project of the workspace through their membership.
 * Returns null when the workspace grants no project access (the user is not a member, or is a
 * Member with `access: 'chosen'`).
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

/** True when the user can create a project in the workspace. Billing users cannot, because the Billing role covers payment only. */
export function canStartProjectIn(
    workspace: Pick<Workspace, 'members'> | null | undefined,
    userId: string
): boolean {
    const role = workspace?.members?.[userId]?.role;
    return role === 'owner' || role === 'admin' || role === 'member';
}

/** A workspace as listed by `GET /workspaces`, with the calling user's role and the workspace's member and project counts. */
export interface WorkspaceSummary {
    id: string;
    name: string;
    personal: boolean;
    createdAt: string;
    /** The calling user's role in the workspace. */
    role: WorkspaceRole;
    /** The calling user's access level. Present when they are a Member. */
    access?: WorkspaceAccess;
    /** The calling user's roles in every project. Present when they are a Member with `access: 'all'`. */
    projectRoles?: string[];
    /** Number of members in the workspace. */
    members: number;
    /** Number of projects in the workspace. */
    projects: number;
}

/**
 * Builds a minimal workspace object, containing only the calling user's membership, from a
 * `GET /workspaces` summary. Pass the result to `workspaceProjectRoles` to compute the user's
 * project roles without loading the full workspace.
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

/** A workspace member as returned in `people` by `GET /workspaces/:id`. */
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

/** A workspace with its members, as returned by `GET /workspaces/:id`. */
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

/** The role and project access given to a user in a workspace, used for members and invites. */
export interface WorkspacePlace {
    role: WorkspaceRole;
    /** Applies to Members: access to every project, or only to projects they are added to (default). */
    access?: WorkspaceAccess;
    /** For Members with `access: 'all'`: their roles in every project. Defaults to Writer when empty. */
    projectRoles?: string[];
}
