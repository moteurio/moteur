/**
 * The roles a user can hold. Roles are stored on the user (account roles) and can be overridden
 * per project through `ProjectSchema.memberRoles`; a project's roles for a user replace the
 * account roles within that project. A role that implies other roles is stored on its own, without
 * the roles it implies.
 *
 * Each role covers one area of a project:
 * - Writer creates content and requests review. Translator edits translations only.
 * - Reviewer approves reviews. Content lead (`lead`) can also publish without review, permanently
 *   delete items from the bins, configure media and edit navigations.
 * - Builder defines the project structure: models, blocks, templates, layouts, structures, forms
 *   and navigations.
 * - Admin manages the project: its settings, members and invites, imports and exports.
 * - Developer manages integrations: API channels, keys, webhooks, branches and the Git remote.
 * - Billing manages payment for the project.
 *
 * Implied roles: Reviewer and Builder imply Writer; Content lead implies Reviewer; Admin implies
 * Content lead; Developer implies Builder. Admin and Developer do not imply each other, so a
 * developer can build a client's site without managing its team. Translator and Billing imply
 * nothing. A user always has at least one stored role: an account created without any is stored
 * as Writer.
 *
 * No role, on an account or in a project, grants access beyond the projects a user belongs to.
 * Server-wide administration belongs to operators, who are not users (see @moteurio/core/operators).
 */
export const ROLE_SLUGS = [
    'writer',
    'translator',
    'reviewer',
    'lead',
    'builder',
    'billing',
    'admin',
    'developer'
] as const;

export type RoleSlug = (typeof ROLE_SLUGS)[number];

import { runsWorkspace, workspaceProjectRoles } from './Workspace.js';

type WithRoles =
    | { roles?: readonly string[] | null; agent?: { reviewOnly?: boolean } | null }
    | null
    | undefined;

/**
 * Roles granted to the user who creates a project: they manage it, pay for it and manage its
 * integrations, which is often all one person does at first. They can assign any of these roles to
 * other members later.
 */
export const PROJECT_CREATOR_ROLES: readonly RoleSlug[] = ['admin', 'billing', 'developer'];

/** The roles each role directly implies. `hasRole` follows these transitively. */
const IMPLIES: Record<RoleSlug, readonly RoleSlug[]> = {
    writer: [],
    translator: [],
    reviewer: ['writer'],
    lead: ['reviewer'],
    builder: ['writer'],
    billing: [],
    admin: ['lead'],
    developer: ['builder']
};

/** Returns `role` and every role it implies, directly or indirectly. */
function withImplied(role: string): string[] {
    const out = [role];
    for (let i = 0; i < out.length; i++)
        for (const next of IMPLIES[out[i] as RoleSlug] ?? [])
            if (!out.includes(next)) out.push(next);
    return out;
}

function storedRoles(user: WithRoles): string[] {
    return Array.isArray(user?.roles) ? user.roles.filter(r => typeof r === 'string') : [];
}

/** Returns the project roles for a user creating a project: their valid account roles plus `PROJECT_CREATOR_ROLES`. */
export function creatorRoles(user: WithRoles): string[] {
    const own = storedRoles(user).filter(r => (ROLE_SLUGS as readonly string[]).includes(r));
    return [...new Set([...own, ...PROJECT_CREATOR_ROLES])];
}

type InWorkspace = Parameters<typeof workspaceProjectRoles>[0];

/** The parts of a project that role resolution reads: per-user role overrides and the member list. */
type ProjectLike =
    | { memberRoles?: Record<string, readonly string[]> | null; users?: readonly string[] | null }
    | null
    | undefined;

/**
 * Returns the roles `user` has in `project`. The first source that applies wins: the roles the
 * project sets for the user, then the roles the project's workspace grants (pass the project's
 * workspace), then the user's account roles. A workspace Owner or Admin keeps their workspace
 * roles in the project in addition to any roles the project sets.
 */
export function rolesInProject(
    user: (WithRoles & { id?: string }) | null | undefined,
    project: ProjectLike,
    workspace?: InWorkspace
): string[] {
    const fromWorkspace = workspaceProjectRoles(workspace, user?.id);
    const own = user?.id ? project?.memberRoles?.[user.id] : undefined;
    const set = Array.isArray(own) ? own.filter(r => typeof r === 'string') : undefined;
    if (set && fromWorkspace && runsWorkspace(workspace?.members?.[user!.id!]?.role))
        return [...new Set([...set, ...fromWorkspace])];
    if (set) return set;
    if (fromWorkspace) return fromWorkspace;
    return storedRoles(user);
}

/** Returns a copy of `user` whose `roles` are the roles they have in `project` (and its workspace). Returns `user` unchanged when neither overrides their roles. */
export function inProject<T extends { id: string; roles?: readonly string[] | null }>(
    user: T,
    project: ProjectLike,
    workspace?: InWorkspace
): T {
    const own = project?.memberRoles?.[user.id];
    const fromWorkspace = workspaceProjectRoles(workspace, user.id);
    return Array.isArray(own) || fromWorkspace
        ? { ...user, roles: rolesInProject(user, project, workspace) }
        : user;
}

/**
 * True when `userId` is listed on the project (including guests), or is a workspace member whose
 * workspace access covers every project.
 */
export function isInProject(
    userId: string | undefined,
    project: { users?: readonly string[] | null } | null | undefined,
    workspace?: InWorkspace
): boolean {
    if (!userId) return false;
    if (Array.isArray(project?.users) && project.users.includes(userId)) return true;
    return workspaceProjectRoles(workspace, userId) !== null;
}

/** True when the user has `role`, either stored directly or implied by another stored role. */
export function hasRole(user: WithRoles, role: string): boolean {
    return storedRoles(user).some(stored => withImplied(stored).includes(role));
}

/** True when the user can create and edit entries and pages in every locale. */
export function canWrite(user: WithRoles): boolean {
    return hasRole(user, 'writer');
}

/** True when the user can edit translations. Users who can write can also translate. */
export function canTranslate(user: WithRoles): boolean {
    return hasRole(user, 'translator') || canWrite(user);
}

/** True when the user is a translator without write access. When both roles are stored, the Writer role takes precedence. */
export function translatorOnly(user: WithRoles): boolean {
    return hasRole(user, 'translator') && !canWrite(user);
}

/** True when the user can approve and reject reviews. Review-only agents never can, because approval requires a person. */
export function canReview(user: WithRoles): boolean {
    if (user?.agent?.reviewOnly) return false;
    return hasRole(user, 'reviewer');
}

/**
 * True when the user needs an approved review before publishing. This applies when the project
 * requires reviews (users with the Content lead role, which Admin implies, are exempt), and always
 * for a review-only agent.
 */
export function needsApproval(
    user: WithRoles,
    project: { workflow?: { enabled?: boolean; requireReview?: boolean } | null } | null | undefined
): boolean {
    if (user?.agent?.reviewOnly) return true;
    return !!(
        project?.workflow?.enabled &&
        project.workflow.requireReview &&
        !hasRole(user, 'lead')
    );
}

/** Returns the error message explaining why publishing was refused when `needsApproval` is true. */
export function approvalMessage(
    user: WithRoles,
    project: { workflow?: { enabled?: boolean } | null } | null | undefined
): string {
    if (!user?.agent?.reviewOnly) {
        return 'Publishing requires an approved review when the project has review workflow enabled.';
    }
    return project?.workflow?.enabled
        ? 'Changes made by an agent go live once a person approves them: ask for a review.'
        : 'Changes made by an agent go live when a person publishes them: the draft is saved.';
}

/** True when the user can view and change a project's billing. The Admin role does not imply it. */
export function canManageBilling(user: WithRoles): boolean {
    return hasRole(user, 'billing');
}

/**
 * Returns the roles to store. An empty list becomes `['writer']`. Roles that another listed role
 * implies are kept; callers decide whether to drop them.
 */
export function normalizeStoredRoles(roles: readonly string[] | null | undefined): string[] {
    const list = (roles ?? []).filter(r => typeof r === 'string' && r.trim() !== '');
    return list.length === 0 ? ['writer'] : [...list];
}
