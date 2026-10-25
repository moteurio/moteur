import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { disconnectProvider } from '../../src/accountConnections.js';
import { generateJWT, rotatePersonalSession, verifyJWT } from '../../src/auth.js';
import { requireAuthSession } from '../../src/authSessions.js';
import { reloadUsers } from '../../src/users.js';

describe('provider removal', () => {
    let root: string;
    const user = {
        id: 'u1',
        email: 'person@example.test',
        isActive: true,
        roles: [],
        projects: [],
        auth: { googleSub: 'subject' }
    };
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-connections-'));
        vi.stubEnv('AUTH_USERS_FILE', path.join(root, 'users.json'));
        vi.stubEnv('DATA_ROOT', root);
        vi.stubEnv('JWT_SECRET', 'connection-test');
        fs.writeFileSync(path.join(root, 'users.json'), JSON.stringify([user]));
        reloadUsers();
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllEnvs();
        reloadUsers();
        fs.rmSync(root, { recursive: true, force: true });
    });
    it('does not remove the last available sign-in method', async () => {
        await expect(disconnectProvider(user.id, 'google')).rejects.toMatchObject({ status: 409 });
    });
    it('revokes credentials without turning token rotation into fresh authentication', async () => {
        vi.useFakeTimers();
        const withPassword = { ...user, passwordHash: 'existing-hash' };
        fs.writeFileSync(path.join(root, 'users.json'), JSON.stringify([withPassword]));
        reloadUsers();
        const token = generateJWT(withPassword);
        const claims = verifyJWT(token);
        const previous = requireAuthSession(claims.sid, user.id);
        vi.advanceTimersByTime(5 * 60_000);
        const updated = await disconnectProvider(user.id, 'google');
        expect(() => verifyJWT(token)).toThrow('revoked');
        const rotated = verifyJWT(rotatePersonalSession(updated, previous));
        expect(rotated.auth_time).toBe(claims.auth_time);
        expect(requireAuthSession(rotated.sid, user.id).expiresAt).toBe(previous.expiresAt);
    });
});
