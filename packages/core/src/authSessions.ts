import { triggerEvent } from './utils/eventBus.js';
import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import type { User } from '@moteurio/types/User.js';
import { privateStatePath, readPrivateState, writePrivateState } from './utils/privateStore.js';

export type AuthSession = {
    id: string;
    userId: string;
    version: number;
    kind: 'person' | 'agent' | 'delegated';
    createdAt: number;
    authenticatedAt: number;
    expiresAt: number;
    label: string;
    parentId?: string;
    depth: number;
};
function file(userId: string): string {
    return (
        process.env.AUTH_SESSIONS_FILE ||
        `${privateStatePath('auth-sessions')}/${createHash('sha256').update(userId).digest('hex')}.json`
    );
}
function load(userId: string): AuthSession[] {
    const sessions = readPrivateState<AuthSession[]>(file(userId), []);
    if (!Array.isArray(sessions)) throw new Error('Invalid session store');
    return sessions.filter(s => s.expiresAt > Date.now());
}
export function createAuthSession(
    user: User,
    ttlMs = 24 * 60 * 60 * 1000,
    options?: { parent?: AuthSession; kind?: AuthSession['kind']; authenticatedAt?: number }
): AuthSession {
    if ((options?.parent?.depth ?? 0) >= 8) throw new Error('Session delegation limit reached');
    const session: AuthSession = {
        id: randomUUID(),
        userId: user.id,
        version: user.authVersion ?? 0,
        kind: options?.kind ?? (user.agent ? 'agent' : 'person'),
        createdAt: Date.now(),
        authenticatedAt: options?.parent?.authenticatedAt ?? options?.authenticatedAt ?? Date.now(),
        expiresAt: Math.min(Date.now() + ttlMs, options?.parent?.expiresAt ?? Infinity),
        label:
            user.agent?.name ?? (options?.kind === 'delegated' ? 'Delegated session' : 'Sign-in'),
        parentId: options?.parent?.id,
        depth: (options?.parent?.depth ?? -1) + 1
    };
    const sessions = load(user.id);
    // Bound both disk growth and sessions an abusive client can create for one account.
    const sameKind = sessions
        .filter(s => s.userId === user.id && s.kind === session.kind)
        .slice(-49);
    writePrivateState(file(user.id), [
        ...sessions.filter(s => s.userId !== user.id || s.kind !== session.kind),
        ...sameKind,
        session
    ]);
    return session;
}
export function requireAuthSession(id: unknown, userId: string, version?: number): AuthSession {
    const sessions = load(userId);
    const session = sessions.find(s => s.id === id && s.userId === userId);
    if (!session || (version != null && session.version !== version))
        throw new Error('Session expired or revoked');
    let parent = session;
    const seen = new Set<string>();
    while (parent.parentId) {
        if (seen.has(parent.id) || seen.size > 8) throw new Error('Invalid session delegation');
        seen.add(parent.id);
        const ancestor = sessions.find(
            s => s.id === parent.parentId && s.userId === userId && s.version === session.version
        );
        if (!ancestor) throw new Error('Session expired or revoked');
        parent = ancestor;
    }
    return session;
}
export function listAuthSessions(userId: string, version?: number): AuthSession[] {
    const all = load(userId).filter(
        session => session.userId === userId && (version == null || session.version === version)
    );
    const byId = new Map(all.map(session => [session.id, session]));
    return all.filter(session => {
        const seen = new Set<string>();
        let current = session;
        while (current.parentId) {
            if (seen.has(current.id) || seen.size > 8) return false;
            seen.add(current.id);
            const parent = byId.get(current.parentId);
            if (!parent) return false;
            current = parent;
        }
        return true;
    });
}
export function revokeAuthSession(userId: string, id?: string): void {
    const sessions = load(userId);
    const removed = new Set(id ? [id] : sessions.filter(s => s.userId === userId).map(s => s.id));
    for (let depth = 0; depth < 9; depth++) {
        for (const session of sessions)
            if (session.userId === userId && session.parentId && removed.has(session.parentId))
                removed.add(session.id);
    }
    writePrivateState(
        file(userId),
        sessions.filter(s => s.userId !== userId || !removed.has(s.id))
    );
    void triggerEvent('auth.sessions.revoked', {
        userId,
        sessionIds: id ? [...removed] : undefined
    });
}

/** An account is gone: its sessions end, and their file goes with it. */
export function forgetAuthSessions(userId: string): void {
    revokeAuthSession(userId);
    // AUTH_SESSIONS_FILE keeps everyone's sessions in one file: only this account's leave it.
    if (!process.env.AUTH_SESSIONS_FILE) fs.rmSync(file(userId), { force: true });
}
