/**
 * Who a person is in the Studio. Roles are stored on the user (account roles) and may be set again
 * per project (`ProjectSchema.memberRoles`), which then replace the account roles in that project.
 * A higher role is not also stored as the roles it implies.
 *
 * Each role looks after one part of a project:
 * - Writer writes and asks for review; Translator edits translations only.
 * - Reviewer approves reviews. Content lead (`lead`) also publishes without review, deletes for
 *   good from the bins, sets up media and edits menus.
 * - Builder shapes the project: models, blocks, templates, layouts, structures, forms and menus.
 * - Admin runs the project: its settings, people and invites, imports and exports.
 * - Developer connects it: API channels, keys, webhooks, branches and its Git remote.
 * - Billing pays for it.
 *
 * What a role implies: Reviewer and Builder imply Writer; Content lead implies Reviewer; Admin
 * implies Content lead; Developer implies Builder. Admin and Developer are apart, so a developer
 * shapes a client's site without running its team. Translator and Billing imply nothing. Roles
 * are always stored: an account made without any is stored as a Writer.
 *
 * No role, on an account or in a project, reaches beyond the projects someone belongs to. Running
 * the whole server is for operators, who are not users (see @moteurio/core/operators).
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

/** The roles each role brings along (one step; `hasRole` follows them all the way). */
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

/** `role` and every role it implies. */
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
    return storedRoles(user).some(stored => withImplied(stored).includes(role));
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
    return hasRole(user, 'reviewer');
}

/**
 * Whether this person needs an approved review to publish: when the project asks for reviews
 * (content leads and admins excepted), and always for a review-only agent.
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
