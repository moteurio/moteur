import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const mail = vi.hoisted(() => ({ sent: [] as { to: string[]; subject: string; text: string }[] }));
vi.mock('../../src/emailNotifier.js', () => ({
    emailUnavailable: () => null,
    sendCodeEmail: async (m: { to: string[]; subject: string; text: string }) => {
        mail.sent.push(m);
    }
}));
const invites = vi.hoisted(() => ({ emails: [] as string[] }));
vi.mock('../../src/invites.js', () => ({
    hasLiveInvite: (e: string) => invites.emails.includes(e)
}));

/** Codes go out after the answer: let them. */
const sent = () => new Promise(resolve => setTimeout(resolve, 0));

const { requestEmailCode, verifyEmailCode, verifyEmailLink } =
    await import('../../src/emailSignIn.js');
const { getUserByEmail, reloadUsers } = await import('../../src/users.js');

/** The six digits of the last code sent to this address. */
const lastCode = (email: string) => {
    const m = [...mail.sent].reverse().find(x => x.to[0] === email);
    return m?.subject.match(/^\d{6}/)?.[0] ?? '';
};

/** The token in the last sign-in link sent to this address. */
const lastToken = (email: string) => {
    const m = [...mail.sent].reverse().find(x => x.to[0] === email);
    const hash = m?.text.match(/\/auth\/email#(\S+)/)?.[1] ?? '';
    return new URLSearchParams(hash).get('token') ?? '';
};

describe('signing in and up with an email code', () => {
    let root: string;
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-email-signin-'));
        vi.stubEnv('AUTH_USERS_FILE', path.join(root, 'users.json'));
        vi.stubEnv('DATA_ROOT', root);
        vi.stubEnv('JWT_SECRET', 'email-code-test');
        vi.stubEnv('AUTH_SESSIONS_FILE', path.join(root, 'sessions.json'));
        fs.writeFileSync(
            path.join(root, 'users.json'),
            JSON.stringify([
                {
                    id: 'u1',
                    email: 'louise@agency.test',
                    name: 'Louise',
                    isActive: true,
                    roles: [],
                    projects: []
                }
            ])
        );
        reloadUsers();
        mail.sent.length = 0;
        invites.emails.length = 0;
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        reloadUsers();
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('makes an account from a code when sign-up is open, and keeps where they came from', async () => {
        vi.stubEnv('MOTEUR_SIGNUP', 'open');
        await requestEmailCode(' Theo@Agency.test ', {
            from: '/for/agencies',
            goal: 'start',
            campaign: { source: 'newsletter', bogus: 'x' } as Record<string, string>,
            locale: 'fr'
        });
        await sent();
        expect(mail.sent[0].subject).toMatch(/^\d{6} est votre code Moteur$/);
        const onNewUser = vi.fn(async () => {});
        const result = await verifyEmailCode('theo@agency.test', lastCode('theo@agency.test'), {
            name: 'Théo',
            onNewUser
        });
        expect(result).toMatchObject({ isNew: true });
        expect(onNewUser).toHaveBeenCalledTimes(1);
        expect(getUserByEmail('theo@agency.test')).toMatchObject({
            name: 'Théo',
            signup: {
                method: 'email',
                from: '/for/agencies',
                goal: 'start',
                campaign: { source: 'newsletter' },
                locale: 'fr'
            }
        });
        expect(getUserByEmail('theo@agency.test')?.passwordHash).toBeUndefined();
    });

    it('signs an existing person in, whatever sign-up says', async () => {
        await requestEmailCode('Louise@Agency.test');
        await sent();
        const result = await verifyEmailCode('louise@agency.test', lastCode('louise@agency.test'));
        expect(result).toMatchObject({ isNew: false });
        expect('token' in result && result.token).toBeTruthy();
    });

    it('sends nothing to a stranger when sign-up is closed, and says the same', async () => {
        await expect(requestEmailCode('stranger@example.test')).resolves.toBeUndefined();
        await sent();
        expect(mail.sent).toHaveLength(0);
        await expect(verifyEmailCode('stranger@example.test', '123456')).rejects.toMatchObject({
            code: 'EMAIL_CODE_EXPIRED'
        });
    });

    it('takes a code once, five tries at most', async () => {
        await requestEmailCode('louise@agency.test');
        await sent();
        const code = lastCode('louise@agency.test');
        const wrong = code === '000000' ? '111111' : '000000';
        await expect(verifyEmailCode('louise@agency.test', wrong)).rejects.toMatchObject({
            code: 'EMAIL_CODE_WRONG'
        });
        await verifyEmailCode('louise@agency.test', code.replace(/(\d{3})/, '$1 '));
        await expect(verifyEmailCode('louise@agency.test', code)).rejects.toMatchObject({
            code: 'EMAIL_CODE_EXPIRED'
        });
    });

    it('waits a minute between codes, and allows ten an hour', async () => {
        vi.useFakeTimers({ now: Date.parse('2026-10-27T10:00:00Z') });
        try {
            await requestEmailCode('louise@agency.test');
            await expect(requestEmailCode('louise@agency.test')).rejects.toMatchObject({
                status: 429,
                code: 'EMAIL_CODE_WAIT'
            });
            for (let i = 0; i < 9; i++) {
                vi.advanceTimersByTime(61_000);
                await requestEmailCode('louise@agency.test');
            }
            vi.advanceTimersByTime(61_000);
            await expect(requestEmailCode('louise@agency.test')).rejects.toMatchObject({
                code: 'EMAIL_CODE_LIMIT'
            });
        } finally {
            vi.useRealTimers();
        }
    });

    it('refuses what is not an email address', async () => {
        await expect(requestEmailCode('not-an-email')).rejects.toMatchObject({
            code: 'EMAIL_INVALID'
        });
    });

    it('lets invited people make their account on a closed server', async () => {
        invites.emails.push('camille@client.test');
        await requestEmailCode('camille@client.test');
        await sent();
        const result = await verifyEmailCode(
            'camille@client.test',
            lastCode('camille@client.test')
        );
        expect(result).toMatchObject({ isNew: true });
    });

    it('stops codes for an address after ten wrong ones in a day', async () => {
        vi.useFakeTimers({ now: Date.parse('2026-10-27T10:00:00Z') });
        try {
            for (let round = 0; round < 2; round++) {
                await requestEmailCode('louise@agency.test');
                for (let i = 0; i < 5; i++)
                    await verifyEmailCode('louise@agency.test', '999999').catch(() => undefined);
                vi.advanceTimersByTime(61_000);
            }
            await expect(requestEmailCode('louise@agency.test')).rejects.toMatchObject({
                code: 'EMAIL_CODE_LOCKED'
            });
        } finally {
            vi.useRealTimers();
        }
    });

    it('sends a sign-in link with the code when the Studio address is known', async () => {
        vi.useFakeTimers({ now: Date.parse('2026-10-27T10:00:00Z') });
        try {
            await requestEmailCode('louise@agency.test');
            vi.advanceTimersByTime(1);
            expect(mail.sent[0].text).not.toContain('/auth/email#');
            mail.sent.length = 0;

            vi.stubEnv('STUDIO_URL', 'https://studio.moteur.test/');
            vi.advanceTimersByTime(61_000);
            await requestEmailCode('louise@agency.test');
            vi.advanceTimersByTime(1);
            const text = mail.sent[0].text;
            expect(text).toContain(
                'https://studio.moteur.test/auth/email#email=louise%40agency.test&token='
            );
            const token = lastToken('louise@agency.test');
            await expect(
                verifyEmailLink('louise@agency.test', 'x'.repeat(43))
            ).rejects.toMatchObject({
                code: 'EMAIL_LINK_EXPIRED'
            });
            const done = await verifyEmailLink('louise@agency.test', token);
            expect(done).toMatchObject({ isNew: false });
            // Once only.
            await expect(verifyEmailLink('louise@agency.test', token)).rejects.toMatchObject({
                code: 'EMAIL_LINK_EXPIRED'
            });
        } finally {
            vi.useRealTimers();
        }
    });

    it('lets the person in by the link when wrong codes have turned codes off', async () => {
        vi.stubEnv('STUDIO_URL', 'https://studio.moteur.test');
        vi.useFakeTimers({ now: Date.parse('2026-10-27T10:00:00Z') });
        try {
            for (let round = 0; round < 2; round++) {
                await requestEmailCode('louise@agency.test');
                for (let i = 0; i < 5; i++)
                    await verifyEmailCode('louise@agency.test', '999999').catch(() => undefined);
                vi.advanceTimersByTime(61_000);
            }
            // Codes are off for the day, but the person still gets a link.
            await requestEmailCode('louise@agency.test');
            vi.advanceTimersByTime(1);
            const last = mail.sent.at(-1)!;
            expect(last.subject).toBe('Your Moteur sign-in link');
            expect(last.subject).not.toMatch(/\d{6}/);
            const token = lastToken('louise@agency.test');

            // Someone asking again for that address doesn't void the link already sent.
            vi.advanceTimersByTime(61_000);
            await requestEmailCode('louise@agency.test');
            await expect(verifyEmailLink('louise@agency.test', token)).resolves.toMatchObject({
                isNew: false
            });
        } finally {
            vi.useRealTimers();
        }
    });

    it('keeps codes from leaving faster than the server allows, all addresses together', async () => {
        vi.stubEnv('MOTEUR_SIGNUP', 'open');
        vi.stubEnv('MOTEUR_EMAIL_CODES_PER_HOUR', '2');
        await requestEmailCode('a@agency.test');
        await requestEmailCode('b@agency.test');
        await expect(requestEmailCode('c@agency.test')).rejects.toMatchObject({
            code: 'EMAIL_CODE_BUSY'
        });
    });

    it('answers before any email goes out', async () => {
        await sent();
        mail.sent.length = 0;
        await requestEmailCode('louise@agency.test');
        expect(mail.sent).toHaveLength(0);
        await sent();
        expect(mail.sent).toHaveLength(1);
    });

    it('can be turned off by the operator', async () => {
        vi.stubEnv('MOTEUR_EMAIL_SIGNIN', 'off');
        await expect(requestEmailCode('louise@agency.test')).rejects.toMatchObject({
            code: 'EMAIL_UNAVAILABLE'
        });
    });
});
