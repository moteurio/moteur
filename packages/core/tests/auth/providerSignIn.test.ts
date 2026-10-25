import { requireAuthSession } from '../../src/authSessions.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    startProviderSignIn,
    describeProviderSignIn,
    requestProviderEmail,
    completeProviderEmail,
    connectProvider
} from '../../src/providerSignIn.js';
import { getUserById, listUsers, reloadUsers } from '../../src/users.js';
import { generateJWT, rotatePersonalSession, verifyJWT } from '../../src/auth.js';
const mail = vi.hoisted(() => vi.fn());
vi.mock('../../src/emailNotifier.js', () => ({ sendVerificationEmail: mail }));

describe('verified provider onboarding and linking', () => {
    let root: string;
    const existing = {
        id: 'u1',
        email: 'existing@example.test',
        isActive: true,
        roles: ['admin'],
        projects: []
    };
    const identity = {
        auth: { microsoftSub: 'new-subject' },
        email: '',
        suggestedEmail: 'new@example.test',
        name: 'New Person'
    };
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-provider-signin-'));
        vi.stubEnv('AUTH_USERS_FILE', path.join(root, 'users.json'));
        vi.stubEnv('DATA_ROOT', root);
        vi.stubEnv('JWT_SECRET', 'provider-proof-test');
        fs.writeFileSync(path.join(root, 'users.json'), JSON.stringify([existing]));
        reloadUsers();
        mail.mockReset().mockResolvedValue(undefined);
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllEnvs();
        reloadUsers();
        fs.rmSync(root, { recursive: true, force: true });
    });
    async function challenge(value = identity, link = false) {
        const result = await startProviderSignIn(value, undefined, { link });
        if (!('pending' in result)) throw new Error('Expected pending proof');
        return result.pending;
    }
    it('creates no account from an unverified provider email, then onboards after email proof', async () => {
        const { ticket, browserToken } = await challenge();
        expect(listUsers()).toHaveLength(1);
        expect(describeProviderSignIn(ticket, browserToken).email).toBe('new@example.test');
        await requestProviderEmail(ticket, browserToken, 'new@example.test');
        const code = mail.mock.calls[0][1];
        const onboarding = vi.fn();
        const result = await completeProviderEmail(ticket, browserToken, code, onboarding);
        expect(verifyJWT(result.token).sub).not.toBe(existing.id);
        expect(listUsers()).toHaveLength(2);
        expect(onboarding).toHaveBeenCalledOnce();
        await expect(completeProviderEmail(ticket, browserToken, code)).rejects.toThrow('expired');
    });
    it('binds pending proofs to the browser and expires them', async () => {
        vi.useFakeTimers();
        const { ticket, browserToken } = await challenge();
        expect(() => describeProviderSignIn(ticket, 'different-browser')).toThrow('expired');
        vi.advanceTimersByTime(601_000);
        expect(() => describeProviderSignIn(ticket, browserToken)).toThrow('expired');
    });
    it('persists attempt and resend limits without storing the raw ticket or code', async () => {
        const { ticket, browserToken } = await challenge();
        await requestProviderEmail(ticket, browserToken, 'new@example.test');
        await expect(
            requestProviderEmail(ticket, browserToken, 'new@example.test')
        ).rejects.toMatchObject({ status: 429 });
        const correct = mail.mock.calls[0][1];
        for (let i = 0; i < 5; i++)
            await expect(completeProviderEmail(ticket, browserToken, 'wrong')).rejects.toThrow(
                'incorrect'
            );
        await expect(completeProviderEmail(ticket, browserToken, correct)).rejects.toThrow(
            'new sign-in'
        );
        const stored = fs.readFileSync(path.join(root, 'provider-signins.json'), 'utf8');
        expect(stored).not.toContain(ticket);
        expect(stored).not.toContain(browserToken);
        expect(JSON.parse(stored)[0].codeHash).not.toBe(correct);
    });
    it('does not attach a provider to an existing account using email proof alone', async () => {
        const { ticket, browserToken } = await challenge();
        await requestProviderEmail(ticket, browserToken, existing.email);
        await expect(
            completeProviderEmail(ticket, browserToken, mail.mock.calls[0][1])
        ).rejects.toMatchObject({ status: 409 });
        expect(getUserById(existing.id)?.auth).toBeUndefined();
    });
    it('connects an explicit pending identity to the authenticated account and rotates its sessions', async () => {
        const { ticket, browserToken } = await challenge(identity, true);
        const before = generateJWT(existing);
        const previous = requireAuthSession(verifyJWT(before).sid, existing.id);
        const result = await connectProvider(ticket, browserToken, existing.id);
        expect(getUserById(existing.id)?.auth).toEqual(identity.auth);
        expect(() => verifyJWT(before)).toThrow('revoked');
        expect(verifyJWT(rotatePersonalSession(result, previous)).sub).toBe(existing.id);
        await expect(connectProvider(ticket, browserToken, existing.id)).rejects.toThrow('expired');
    });
    it('refuses to connect an identity already owned by another account', async () => {
        fs.writeFileSync(
            path.join(root, 'users.json'),
            JSON.stringify([
                existing,
                { ...existing, id: 'u2', email: 'other@example.test', auth: identity.auth }
            ])
        );
        reloadUsers();
        const { ticket, browserToken } = await challenge(identity, true);
        await expect(connectProvider(ticket, browserToken, existing.id)).rejects.toMatchObject({
            status: 409
        });
    });
});
