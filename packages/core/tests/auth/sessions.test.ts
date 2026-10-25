import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { generateJWT, generateSessionToken, refreshJWT, verifyJWT } from '../../src/auth.js';
import { listAuthSessions, revokeAuthSession } from '../../src/authSessions.js';
import { getUserById, reloadUsers, setUserPasswordHash } from '../../src/users.js';
import type { User } from '@moteurio/types/User.js';

describe('revocable user sessions', () => {
    let root: string;
    const user: User = {
        id: 'u1',
        email: 'person@example.test',
        isActive: true,
        roles: [],
        projects: []
    };
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-session-test-'));
        vi.stubEnv('DATA_ROOT', root);
        vi.stubEnv('AUTH_USERS_FILE', path.join(root, 'users.json'));
        vi.stubEnv('AUTH_SESSIONS_FILE', path.join(root, 'sessions.json'));
        vi.stubEnv('JWT_SECRET', 'test-session-secret');
        fs.writeFileSync(path.join(root, 'users.json'), JSON.stringify([user]));
        reloadUsers();
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllEnvs();
        reloadUsers();
        fs.rmSync(root, { recursive: true, force: true });
    });
    it('revokes one session without ending another', () => {
        const first = generateJWT(user);
        const second = generateJWT(user);
        const payload = verifyJWT(first);
        revokeAuthSession(user.id, payload.sid);
        expect(() => verifyJWT(first)).toThrow('revoked');
        expect(verifyJWT(second).sub).toBe(user.id);
    });
    it('revokes every session after a password change', async () => {
        const token = generateJWT(user);
        await setUserPasswordHash(user.id, 'replacement-hash');
        expect(getUserById(user.id)?.authVersion).toBe(1);
        expect(() => verifyJWT(token)).toThrow('revoked');
        expect(verifyJWT(generateJWT(getUserById(user.id)!)).sub).toBe(user.id);
    });
    it('preserves authentication time and the absolute deadline during refresh', () => {
        vi.useFakeTimers();
        const token = generateJWT(user);
        const first = verifyJWT(token);
        const deadline = listAuthSessions(user.id)[0].expiresAt;
        vi.advanceTimersByTime(30 * 60 * 1000);
        const refreshed = refreshJWT(user, verifyJWT(token));
        expect(verifyJWT(refreshed)).toMatchObject({ sid: first.sid, auth_time: first.auth_time });
        expect(listAuthSessions(user.id)[0].expiresAt).toBe(deadline);
        vi.setSystemTime(deadline + 1);
        expect(() => verifyJWT(refreshed)).toThrow();
    });
    it('does not refresh an agent token', () => {
        const agent = { ...user, agent: { name: 'Assistant', reviewOnly: true } };
        const token = generateSessionToken(agent, 600);
        expect(() => refreshJWT(agent, verifyJWT(token))).toThrow('cannot refresh');
    });
    it('does not refresh authentication time by exchanging an old token for a delegated token', () => {
        vi.useFakeTimers();
        const root = generateJWT(user);
        const original = verifyJWT(root);
        vi.advanceTimersByTime(20 * 60 * 1000);
        const delegated = generateSessionToken(user, 600, verifyJWT(root));
        expect(verifyJWT(delegated).auth_time).toBe(original.auth_time);
        expect(listAuthSessions(user.id).find(s => s.id === verifyJWT(delegated).sid)?.kind).toBe(
            'delegated'
        );
        revokeAuthSession(user.id, original.sid);
        expect(() => verifyJWT(delegated)).toThrow('revoked');
    });
    it('rejects old stateless tokens and corrupt state instead of recreating it', () => {
        expect(() => verifyJWT(jwt.sign({ sub: user.id }, 'test-session-secret'))).toThrow(
            'revoked'
        );
        const token = generateJWT(user);
        fs.writeFileSync(path.join(root, 'sessions.json'), 'broken');
        expect(() => verifyJWT(token)).toThrow('could not be read');
        expect(() => generateJWT(user)).toThrow('could not be read');
    });
});
