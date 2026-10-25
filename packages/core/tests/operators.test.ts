import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { base32Encode, totpCode, totpStep, verifyTotp } from '../src/totp.js';
import {
    addOperator,
    completeEnrollment,
    listOperators,
    loginOperator,
    removeOperator,
    resetOperator,
    resetOperatorLockouts,
    startEnrollment,
    verifyOperatorToken
} from '../src/operators.js';
import { generateJWT, verifyJWT } from '../src/auth.js';

describe('authenticator codes (RFC 6238)', () => {
    // The RFC's SHA1 secret, "12345678901234567890"; its 8-digit codes end in these 6 digits.
    const secret = base32Encode(Buffer.from('12345678901234567890'));

    it('match the published test vectors', () => {
        expect(totpCode(secret, totpStep(59_000))).toBe('287082');
        expect(totpCode(secret, totpStep(1_111_111_109_000))).toBe('081804');
        expect(totpCode(secret, totpStep(1_234_567_890_000))).toBe('005924');
        expect(totpCode(secret, totpStep(2_000_000_000_000))).toBe('279037');
    });

    it('accept the step either side, and never a code already used', () => {
        const now = 1_234_567_890_000;
        const code = totpCode(secret, totpStep(now));
        expect(verifyTotp(secret, code, { now })).toBe(totpStep(now));
        expect(verifyTotp(secret, code, { now: now + 30_000 })).toBe(totpStep(now));
        expect(verifyTotp(secret, code, { now: now + 90_000 })).toBeNull();
        expect(verifyTotp(secret, code, { now, after: totpStep(now) })).toBeNull();
        expect(verifyTotp(secret, '12345', { now })).toBeNull();
    });
});

describe('operators', () => {
    let dir: string;
    const password = 'a long operator password';

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-operators-'));
        vi.stubEnv('OPERATORS_FILE', path.join(dir, 'operators.json'));
        vi.stubEnv('AUTH_SESSIONS_FILE', path.join(dir, 'sessions.json'));
        vi.stubEnv('JWT_SECRET', 'test-secret');
        resetOperatorLockouts();
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    async function enrolled(email = 'ops@moteur.io') {
        const { token } = addOperator({ email, name: 'Ops' });
        const { secret } = startEnrollment(token);
        const done = await completeEnrollment(token, {
            password,
            code: totpCode(secret, totpStep())
        });
        return { secret, ...done };
    }

    it('are kept apart from users, in their own file only the server may read', async () => {
        await enrolled();
        const file = path.join(dir, 'operators.json');
        expect(fs.statSync(file).mode & 0o777).toBe(0o600);
        const raw = fs.readFileSync(file, 'utf8');
        expect(raw).not.toContain(password);
        expect(listOperators()).toEqual([
            expect.objectContaining({
                email: 'ops@moteur.io',
                enrolled: true,
                recoveryCodesLeft: 10
            })
        ]);
    });

    it('enroll once through their link, with a code proving the authenticator works', async () => {
        const { token } = addOperator({ email: 'a@moteur.io' });
        const first = startEnrollment(token);
        expect(first.otpauth).toMatch(/^otpauth:\/\/totp\/Moteur%3Aa%40moteur.io\?secret=/);
        expect(startEnrollment(token).secret).toBe(first.secret);
        await expect(completeEnrollment(token, { password, code: '000000' })).rejects.toThrow(
            /code is not right/
        );
        await expect(
            completeEnrollment(token, {
                password: 'short',
                code: totpCode(first.secret, totpStep())
            })
        ).rejects.toThrow(/at least/);
        const done = await completeEnrollment(token, {
            password,
            code: totpCode(first.secret, totpStep())
        });
        expect(done.recoveryCodes).toHaveLength(10);
        expect(verifyOperatorToken(done.token).email).toBe('a@moteur.io');
        expect(() => startEnrollment(token)).toThrow(/expired or was already used/);
    });

    it('sign in with password and code; a code works once', async () => {
        const { secret } = await enrolled();
        const later = Date.now() + 60_000;
        vi.useFakeTimers({ now: later });
        try {
            const code = totpCode(secret, totpStep(later));
            const s = await loginOperator({ email: 'OPS@moteur.io', password, code });
            expect(verifyOperatorToken(s.token).email).toBe('ops@moteur.io');
            await expect(loginOperator({ email: 'ops@moteur.io', password, code })).rejects.toThrow(
                'Wrong email, password or code'
            );
        } finally {
            vi.useRealTimers();
        }
    });

    it('take a recovery code instead, once', async () => {
        const { recoveryCodes } = await enrolled();
        await loginOperator({ email: 'ops@moteur.io', password, code: recoveryCodes[0] });
        await expect(
            loginOperator({ email: 'ops@moteur.io', password, code: recoveryCodes[0] })
        ).rejects.toThrow('Wrong email, password or code');
        expect(listOperators()[0].recoveryCodesLeft).toBe(9);
    });

    it('say the same for every mistake, and lock after five', async () => {
        const { secret } = await enrolled();
        const code = () => totpCode(secret, totpStep());
        const tries = [
            { email: 'nobody@moteur.io', password, code: code() },
            { email: 'ops@moteur.io', password: 'wrong password!!', code: code() },
            { email: 'ops@moteur.io', password, code: '123456' }
        ];
        for (const t of tries)
            await expect(loginOperator(t)).rejects.toThrow('Wrong email, password or code');
        // Two wrong tries for ops@ so far; three more lock it, even with everything right next.
        for (let i = 0; i < 3; i++) await expect(loginOperator(tries[2])).rejects.toThrow();
        await expect(
            loginOperator({ email: 'ops@moteur.io', password, code: code() })
        ).rejects.toThrow(/Too many tries/);
    });

    it('have tokens no user route accepts, and that end when they are reset or removed', async () => {
        const { token } = await enrolled();
        expect(() => verifyJWT(token)).toThrow();
        const userToken = generateJWT({
            id: 'u1',
            email: 'u@x',
            roles: ['admin'],
            isActive: true
        } as never);
        expect(() => verifyOperatorToken(userToken)).toThrow('Operator sign-in required');

        const id = listOperators()[0].id;
        await enrolled('second@moteur.io');
        resetOperator(id);
        expect(() => verifyOperatorToken(token)).toThrow('Operator sign-in required');
        expect(listOperators().find(o => o.id === id)?.enrolled).toBe(false);
        removeOperator(id);
        expect(listOperators()).toHaveLength(1);
    });

    it('keep at least one operator', async () => {
        await enrolled();
        expect(() => removeOperator(listOperators()[0].id)).toThrow(/at least one operator/);
    });
});
