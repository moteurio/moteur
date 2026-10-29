import type { User } from '@moteurio/types/User.js';

/**
 * Marks the engine's own actors (the scheduler, form actions). A symbol can't come from a
 * token, a login or JSON, so nobody can pass as one from outside.
 */
const SYSTEM_ACTOR = Symbol('moteur.systemActor');

/** A user for work the engine does by itself: it may act in every project. */
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
