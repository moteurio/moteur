/**
 * Who a person is in the Studio. Roles are stored on the user (account roles) and may be set again
 * per project (`ProjectSchema.memberRoles`), which then replace the account roles in that project.
 * A higher role is not also stored as the roles it implies.
 *
 * Developer implies Admin. Admin, Reviewer and Developer imply Writer. Translator and Billing
 * imply nothing. An empty list is a Writer, for people saved before Writer was stored.
 *
 * No role, on an account or in a project, reaches beyond the projects someone belongs to. Running
 * the whole server is for operators, who are not users (see @moteurio/core/operators).
 */
export const ROLE_SLUGS = [
    'writer',
    'translator',
    'reviewer',
    'billing',
    'admin',
    'developer'
] as const;

export type RoleSlug = (typeof ROLE_SLUGS)[number];

type WithRoles =
    | { roles?: readonly string[] | null; agent?: { reviewOnly?: boolean } | null }
    | null
    | undefined;
type WithMemberRoles =
    { memberRoles?: Record<string, readonly string[]> | null } | null | undefined;

/**
 * Roles the person who creates a project gets on it: they run it, pay for it, and connect its
 * site (often alone, on day one). They can hand any of these to someone else later.
 */
export const PROJECT_CREATOR_ROLES: readonly RoleSlug[] = ['admin', 'billing', 'developer'];

function storedRoles(user: WithRoles): string[] {
    return Array.isArray(user?.roles) ? user.roles.filter(r => typeof r === 'string') : [];
}

/** Project roles for the person creating a project: their Studio roles, plus Admin and Billing. */
export function creatorRoles(user: WithRoles): string[] {
    const own = storedRoles(user).filter(r => (ROLE_SLUGS as readonly string[]).includes(r));
    return [...new Set([...own, ...PROJECT_CREATOR_ROLES])];
}

/** The roles `user` has in `project`: those set on the project for them, else their account's. */
export function rolesInProject(
    user: (WithRoles & { id?: string }) | null | undefined,
    project: WithMemberRoles
): string[] {
    const own = user?.id ? project?.memberRoles?.[user.id] : undefined;
    return Array.isArray(own) ? own.filter(r => typeof r === 'string') : storedRoles(user);
}

/** `user` as they are in `project`: the same person, with their roles there. */
export function inProject<T extends { id: string; roles?: readonly string[] | null }>(
    user: T,
    project: WithMemberRoles
): T {
    const own = project?.memberRoles?.[user.id];
    return Array.isArray(own) ? { ...user, roles: rolesInProject(user, project) } : user;
}

/** Whether this person has `role`, counting what a stored role implies. */
export function hasRole(user: WithRoles, role: string): boolean {
    const roles = storedRoles(user);
    const empty = roles.length === 0;
    if (role === 'writer') {
        return (
            empty ||
            roles.includes('writer') ||
            roles.includes('reviewer') ||
            roles.includes('admin') ||
            roles.includes('developer')
        );
    }
    if (role === 'admin') return roles.includes('admin') || roles.includes('developer');
    if (role === 'developer') return roles.includes('developer');
    if (role === 'reviewer') return roles.includes('reviewer');
    if (role === 'translator') return roles.includes('translator');
    if (role === 'billing') return roles.includes('billing');
    return roles.includes(role);
}

/** Create and edit entries and pages in every language. */
export function canWrite(user: WithRoles): boolean {
    return hasRole(user, 'writer');
}

/** Edit translations. Anyone who can write can also translate. */
export function canTranslate(user: WithRoles): boolean {
    return hasRole(user, 'translator') || canWrite(user);
}

/** A translator who cannot otherwise edit. The wider role wins when both are stored. */
export function translatorOnly(user: WithRoles): boolean {
    return hasRole(user, 'translator') && !canWrite(user);
}

/** Approve and reject reviews. A review-only agent never can: approving is a person's call. */
export function canReview(user: WithRoles): boolean {
    if (user?.agent?.reviewOnly) return false;
    return hasRole(user, 'reviewer') || hasRole(user, 'admin');
}

/**
 * Whether this person needs an approved review to publish: when the project asks for reviews
 * (admins excepted), and always for a review-only agent.
 */
export function needsApproval(
    user: WithRoles,
    project: { workflow?: { enabled?: boolean; requireReview?: boolean } | null } | null | undefined
): boolean {
    if (user?.agent?.reviewOnly) return true;
    return !!(
        project?.workflow?.enabled &&
        project.workflow.requireReview &&
        !hasRole(user, 'admin')
    );
}

/** Why publishing was refused, for `needsApproval`. */
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

/** See and change how a project is paid for. Admin does not imply it. */
export function canManageBilling(user: WithRoles): boolean {
    return hasRole(user, 'billing');
}

/**
 * Roles to store. An empty list becomes Writer. Does not remove a role that another implies:
 * callers decide what to persist.
 */
export function normalizeStoredRoles(roles: readonly string[] | null | undefined): string[] {
    const list = (roles ?? []).filter(r => typeof r === 'string' && r.trim() !== '');
    return list.length === 0 ? ['writer'] : [...list];
}
