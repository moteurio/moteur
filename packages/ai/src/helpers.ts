import type { ProjectSchema, AiHelper } from '@moteurio/types/Project.js';
import { AI_HELPERS, DEFAULT_AI_ROLES } from '@moteurio/types/Project.js';
import { hasRole } from '@moteurio/types';
import type { User } from '@moteurio/types/User.js';

/** Why a helper can't be used: off for the project, or not for this person's role. */
export type HelperState = 'ok' | 'off' | 'role';

/**
 * Whether a person may ask for a helper in a project. Every helper is off until the project
 * turns it on (`ai.helpers.write: true`…), and only the roles in `ai.roles` (default: admin
 * and writer) may ask. A translator may always ask for a translation.
 */
export function helperState(project: ProjectSchema, user: User, helper: AiHelper): HelperState {
    if (project.ai?.enabled === false || project.ai?.helpers?.[helper] !== true) return 'off';
    if (helper === 'translate' && hasRole(user, 'translator')) return 'ok';
    const roles = project.ai?.roles ?? DEFAULT_AI_ROLES;
    return roles.some(role => hasRole(user, role)) ? 'ok' : 'role';
}

export function helperStates(project: ProjectSchema, user: User): Record<AiHelper, HelperState> {
    return Object.fromEntries(AI_HELPERS.map(h => [h, helperState(project, user, h)])) as Record<
        AiHelper,
        HelperState
    >;
}

/** Thrown when a helper is asked for but isn't allowed. HTTP 403. */
export class AiHelperError extends Error {
    readonly status = 403;
    constructor(
        readonly code: 'AI_HELPER_OFF' | 'AI_HELPER_ROLE',
        helper: AiHelper
    ) {
        super(
            code === 'AI_HELPER_OFF'
                ? `The ${helper} helper is off for this project.`
                : `Your role can't ask for the ${helper} helper in this project.`
        );
        this.name = 'AiHelperError';
    }
}

export function assertHelper(project: ProjectSchema, user: User, helper: AiHelper): void {
    const state = helperState(project, user, helper);
    if (state === 'off') throw new AiHelperError('AI_HELPER_OFF', helper);
    if (state === 'role') throw new AiHelperError('AI_HELPER_ROLE', helper);
}
