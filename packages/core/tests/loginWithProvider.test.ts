import { beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import type { User } from '@moteurio/types/User.js';

const users: User[] = [];

vi.mock('../src/users.js', () => ({
    reloadUsers: vi.fn(),
    getUserByEmail: (email: string) => users.find(u => u.email === email),
    createUser: (user: User) => {
        users.push(user);
        return user;
    },
    recordUserLogin: () => '2026-10-19T00:00:00.000Z'
}));
vi.mock('../src/projects.js', () => ({ getProjectIdsForUser: () => [] }));

const { loginWithProvider } = await import('../src/auth.js');

describe('loginWithProvider', () => {
    beforeEach(() => {
        users.length = 0;
        vi.stubEnv('JWT_SECRET', 'test-secret');
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

    it('signs into the existing account with that address', async () => {
        users.push({
            id: 'user:1',
            email: 'grace@example.com',
            isActive: true,
            roles: ['admin'],
            projects: []
        });
        const { user, isNew } = await loginWithProvider({
            auth: { googleSub: 's' },
            email: 'grace@example.com'
        });
        expect(isNew).toBe(false);
        expect(user.id).toBe('user:1');
    });

    it('refuses a disabled account', async () => {
        users.push({
            id: 'user:2',
            email: 'off@example.com',
            isActive: false,
            roles: [],
            projects: []
        });
        await expect(
            loginWithProvider({ auth: { githubId: 1 }, email: 'off@example.com' })
        ).rejects.toThrow('User is not active');
    });
});
