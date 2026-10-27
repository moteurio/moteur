import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import type { User } from '@moteurio/types/User.js';

const users: User[] = [];

vi.mock('../src/users.js', () => ({
    reloadUsers: vi.fn(),
    listUsers: () => users,
    getUserByEmail: (email: string) => users.find(u => u.email === email),
    createUser: (user: User) => {
        users.push(user);
        return user;
    },
    recordUserLogin: () => '2026-10-19T00:00:00.000Z',
    withoutSecrets: (user: User) => user
}));
vi.mock('../src/projects.js', () => ({ getProjectIdsForUser: () => [] }));

const { loginWithProvider } = await import('../src/auth.js');

let sessionRoot: string;
describe('loginWithProvider', () => {
    beforeEach(() => {
        sessionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-auth-sessions-'));
        vi.stubEnv('AUTH_SESSIONS_FILE', path.join(sessionRoot, 'sessions.json'));
        users.length = 0;
        vi.stubEnv('JWT_SECRET', 'test-secret');
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        fs.rmSync(sessionRoot, { recursive: true, force: true });
    });

    it('creates an account for a new address and onboards it once', async () => {
        const onNewUser = vi.fn(async () => {});
        const first = await loginWithProvider(
            { auth: { githubId: 7 }, email: 'Ada@Example.com', name: 'Ada' },
            onNewUser
        );
        expect(first.isNew).toBe(true);
        expect(first.user).toMatchObject({ email: 'ada@example.com', name: 'Ada', roles: [] });
        expect(jwt.verify(first.token, 'test-secret')).toMatchObject({ email: 'ada@example.com' });

        const again = await loginWithProvider(
            { auth: { githubId: 7 }, email: 'ada@example.com' },
            onNewUser
        );
        expect(again.isNew).toBe(false);
        expect(again.user.id).toBe(first.user.id);
        expect(onNewUser).toHaveBeenCalledTimes(1);
    });

    it('signs into the existing account linked to that provider identity', async () => {
        users.push({
            id: 'user:1',
            email: 'grace@example.com',
            isActive: true,
            roles: ['admin'],
            auth: { googleSub: 's' },
            projects: []
        });
        const { user, isNew } = await loginWithProvider({
            auth: { googleSub: 's' },
            email: 'grace@example.com'
        });
        expect(isNew).toBe(false);
        expect(user.id).toBe('user:1');
    });

    it('does not link an existing account solely because its email matches', async () => {
        users.push({
            id: 'user:1',
            email: 'grace@example.com',
            isActive: true,
            roles: ['admin'],
            projects: []
        });
        await expect(
            loginWithProvider({
                auth: { googleSub: 'different-subject' },
                email: 'grace@example.com'
            })
        ).rejects.toThrow('Sign in with your existing method');
        expect(users).toHaveLength(1);
        expect(users[0].auth).toBeUndefined();
    });

    it('refuses a disabled account', async () => {
        users.push({
            id: 'user:2',
            email: 'off@example.com',
            isActive: false,
            roles: [],
            auth: { githubId: 1 },
            projects: []
        });
        await expect(
            loginWithProvider({ auth: { githubId: 1 }, email: 'off@example.com' })
        ).rejects.toThrow('User is not active');
    });
});
