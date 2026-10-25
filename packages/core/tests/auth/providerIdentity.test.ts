import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@moteurio/types/User.js';
const state = vi.hoisted(() => ({ users: [] as User[] }));
vi.mock('../../src/users.js', () => ({
    reloadUsers: vi.fn(),
    listUsers: () => state.users,
    getUserByEmail: (email: string) => state.users.find(u => u.email === email),
    createUser: (user: User) => {
        state.users.push(user);
        return user;
    },
    recordUserLogin: vi.fn()
}));
vi.mock('../../src/projects.js', () => ({ getProjectIdsForUser: () => [] }));
import { loginWithProvider } from '../../src/auth.js';

let sessionRoot: string;
describe('provider identity', () => {
    beforeEach(() => {
        sessionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-auth-sessions-'));
        vi.stubEnv('AUTH_SESSIONS_FILE', path.join(sessionRoot, 'sessions.json'));
        vi.stubEnv('JWT_SECRET', 'provider-identity-test');
        state.users = [
            {
                id: 'victim',
                email: 'victim@example.test',
                isActive: true,
                roles: [],
                projects: [],
                auth: { oidcSub: 'issuer#victim' }
            }
        ];
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        fs.rmSync(sessionRoot, { recursive: true, force: true });
    });
    it('refuses to link a different subject through the same email', async () => {
        await expect(
            loginWithProvider({
                email: 'victim@example.test',
                auth: { oidcSub: 'issuer#attacker' }
            })
        ).rejects.toThrow('existing method');
        expect(state.users).toHaveLength(1);
    });
    it('matches the original provider identity after its email changes', async () => {
        const result = await loginWithProvider({
            email: 'changed@example.test',
            auth: { oidcSub: 'issuer#victim' }
        });
        expect(result.user.id).toBe('victim');
        expect(result.isNew).toBe(false);
    });
    it('allows an already linked identity without a new verified email claim', async () => {
        expect(
            (await loginWithProvider({ email: '', auth: { oidcSub: 'issuer#victim' } })).user.id
        ).toBe('victim');
    });
    it('requires a verified email for a new identity', async () => {
        await expect(
            loginWithProvider({ email: '', auth: { oidcSub: 'issuer#new' } })
        ).rejects.toThrow('verified email');
    });
    it('refuses an empty subject', async () => {
        await expect(
            loginWithProvider({ email: 'new@example.test', auth: { oidcSub: '' } })
        ).rejects.toThrow('stable identity');
    });
    it('onboards a new identity once and uses its subject on later logins', async () => {
        const identity = { email: 'new@example.test', auth: { githubId: 123 } };
        const onboarding = vi.fn();
        const first = await loginWithProvider(identity, onboarding);
        const second = await loginWithProvider(identity, onboarding);
        expect(first.isNew).toBe(true);
        expect(second.user.id).toBe(first.user.id);
        expect(onboarding).toHaveBeenCalledTimes(1);
    });
});
