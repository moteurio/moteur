import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcrypt';
import { loginUser, verifyJWT } from '../../src/auth.js';
import { totpCode, totpStep } from '../../src/totp.js';
import {
    beginTwoFactor,
    completeTwoFactor,
    disableTwoFactor,
    enableTwoFactor,
    renewRecoveryCodes,
    resetTwoFactor,
    twoFactorTicket
} from '../../src/twoFactor.js';
import { getUserById, reloadUsers } from '../../src/users.js';

const email = 'louise@journal.test';
const password = 'a long password';

describe('two-step sign-in', () => {
    let root: string;
    beforeEach(async () => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-2fa-'));
        vi.stubEnv('AUTH_USERS_FILE', path.join(root, 'users.json'));
        vi.stubEnv('DATA_ROOT', root);
        vi.stubEnv('JWT_SECRET', 'two-factor-test');
        vi.stubEnv('MOTEUR_ENCRYPTION_KEY', 'b'.repeat(64));
        const user = {
            id: 'u1',
            email,
            name: 'Louise',
            isActive: true,
            roles: ['admin'],
            projects: [],
            passwordHash: await bcrypt.hash(password, 4)
        };
        fs.writeFileSync(path.join(root, 'users.json'), JSON.stringify([user]));
        reloadUsers();
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllEnvs();
        reloadUsers();
        fs.rmSync(root, { recursive: true, force: true });
    });

    /** What the authenticator app would show now (or `ahead` steps later). */
    const appCode = (secret: string, ahead = 0) => totpCode(secret, totpStep() + ahead);

    async function turnOn(): Promise<{ secret: string; recoveryCodes: string[] }> {
        const { secret, otpauth } = await beginTwoFactor('u1');
        expect(otpauth).toMatch(/^otpauth:\/\/totp\//);
        const { recoveryCodes } = await enableTwoFactor('u1', appCode(secret));
        return { secret, recoveryCodes };
    }

    it('never sends a password hash back from signing in', async () => {
        const result = await loginUser(email, password);
        expect('token' in result && result.user).not.toHaveProperty('passwordHash');
    });

    it('keeps the secret sealed, and turns on only with a right first code', async () => {
        const { secret } = await beginTwoFactor('u1');
        await expect(enableTwoFactor('u1', '000000')).rejects.toThrow('isn’t right');
        const stored = fs.readFileSync(path.join(root, 'users.json'), 'utf8');
        expect(stored).not.toContain(secret);
        const { recoveryCodes } = await enableTwoFactor('u1', appCode(secret));
        expect(recoveryCodes).toHaveLength(10);
        expect(recoveryCodes[0]).toMatch(/^[A-Z2-7]{4}-[A-Z2-7]{4}$/);
        reloadUsers();
        expect(getUserById('u1')?.twoFactorPending).toBeUndefined();
    });

    it('asks for a code after the password, and a code works only once', async () => {
        const { secret } = await turnOn();
        const first = await loginUser(email, password);
        expect(first).toEqual({ twoFactor: { ticket: expect.any(String) } });
        const ticket = 'twoFactor' in first ? first.twoFactor.ticket : '';
        // The ticket alone is no session.
        expect(() => verifyJWT(ticket)).toThrow();

        await expect(completeTwoFactor(ticket, '123456')).rejects.toMatchObject({
            code: 'TWO_FACTOR_INVALID'
        });
        const code = appCode(secret, 1);
        const done = await completeTwoFactor(ticket, code);
        expect(verifyJWT(done.token).sub).toBe('u1');
        expect(done.user).not.toHaveProperty('passwordHash');
        expect(done.user.twoFactor).toBe(true);
        await expect(completeTwoFactor(ticket, code)).rejects.toMatchObject({
            code: 'TWO_FACTOR_INVALID'
        });
    });

    it('takes each recovery code once, and new ones replace the old', async () => {
        const { secret, recoveryCodes } = await turnOn();
        const ticket = twoFactorTicket({ id: 'u1' });
        const done = await completeTwoFactor(ticket, recoveryCodes[0].toLowerCase());
        expect(done.usedRecovery).toBe(true);
        await expect(completeTwoFactor(ticket, recoveryCodes[0])).rejects.toMatchObject({
            code: 'TWO_FACTOR_INVALID'
        });
        const renewed = await renewRecoveryCodes('u1', appCode(secret, 1));
        await expect(completeTwoFactor(ticket, recoveryCodes[1])).rejects.toMatchObject({
            code: 'TWO_FACTOR_INVALID'
        });
        await expect(completeTwoFactor(ticket, renewed.recoveryCodes[0])).resolves.toMatchObject({
            usedRecovery: true
        });
    });

    it('refuses an expired or forged ticket', async () => {
        const { secret } = await turnOn();
        await expect(completeTwoFactor('not-a-ticket', appCode(secret))).rejects.toMatchObject({
            code: 'TWO_FACTOR_EXPIRED'
        });
        vi.useFakeTimers({ now: Date.now() });
        const ticket = twoFactorTicket({ id: 'u1' });
        vi.advanceTimersByTime(6 * 60 * 1000);
        await expect(completeTwoFactor(ticket, appCode(secret))).rejects.toMatchObject({
            code: 'TWO_FACTOR_EXPIRED'
        });
    });

    it('turns off only with a code, and an operator can reset it', async () => {
        const { secret } = await turnOn();
        await expect(disableTwoFactor('u1', '000000')).rejects.toThrow('isn’t right');
        await disableTwoFactor('u1', appCode(secret, 1));
        expect('token' in (await loginUser(email, password))).toBe(true);

        await turnOn();
        await resetTwoFactor('u1');
        reloadUsers();
        expect(getUserById('u1')?.twoFactor).toBeUndefined();
        expect(getUserById('u1')?.authVersion).toBe(1);
    });

    it('refuses to keep a secret in clear on a production server', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('MOTEUR_ENCRYPTION_KEY', '');
        await expect(beginTwoFactor('u1')).rejects.toThrow('MOTEUR_ENCRYPTION_KEY');
    });
});
