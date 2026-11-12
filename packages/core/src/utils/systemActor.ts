import type { User } from '@moteurio/types/User.js';

/**
 * Marks the engine's own actors (the scheduler and form actions). A symbol cannot come from a
 * token, a login or JSON, so a client cannot pose as a system actor.
 */
const SYSTEM_ACTOR = Symbol('moteur.systemActor');

/** Creates a user for work the engine does by itself. It may act in every project. */
export function systemActor(id: string, name: string): User {
    return Object.assign(
        {
            id,
            name,
            isActive: true,
            email: '',
            roles: ['admin', 'developer'],
            projects: []
        } as User,
        { [SYSTEM_ACTOR]: true }
    );
}

export function isSystemActor(user: User | undefined | null): boolean {
    return Boolean(user && (user as unknown as Record<symbol, unknown>)[SYSTEM_ACTOR]);
}
