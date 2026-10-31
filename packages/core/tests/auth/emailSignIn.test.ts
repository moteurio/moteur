import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const mail = vi.hoisted(() => ({
    sent: [] as { to: string[]; subject?: string; text?: string; kind?: string; data?: unknown }[],
    off: false
}));
vi.mock('../../src/emailNotifier.js', () => ({
    emailUnavailable: () => (mail.off ? 'No SMTP' : null),
    sendCodeEmail: async (m: { to: string[]; subject: string; text: string }) => {
        mail.sent.push(m);
    },
    sendEmail: async (m: { to: string[]; subject: string; text: string }) => {
        mail.sent.push(m);
    },
    sendTemplateEmail: async (kind: string, to: string[], data: unknown) => {
        mail.sent.push({ kind, to, data });
    }
}));
const invites = vi.hoisted(() => ({ emails: [] as string[] }));
vi.mock('../../src/invites.js', () => ({
    hasLiveInvite: (e: string) => invites.emails.includes(e)
}));

/** Codes go out after the answer: let them. */
const sent = () => new Promise(resolve => setTimeout(resolve, 0));

const {
    requestEmailCode,
    verifyEmailCode,
    verifyEmailLink,
    requestEmailChange,
    confirmEmailChange
} = await import('../../src/emailSignIn.js');
const { getUserByEmail, getUserById, reloadUsers } = await import('../../src/users.js');
const { onEvent } = await import('../../src/utils/eventBus.js');

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
        mail.off = false;
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
                code: 'EMAIL_CODE_WAIT',
                retryAfter: 60
            });
            vi.advanceTimersByTime(20_500);
            await expect(requestEmailCode('louise@agency.test')).rejects.toMatchObject({
                code: 'EMAIL_CODE_WAIT',
                retryAfter: 40
            });
            vi.advanceTimersByTime(40_500);
            for (let i = 0; i < 9; i++) {
                await requestEmailCode('louise@agency.test');
                vi.advanceTimersByTime(61_000);
            }
            // Ten sent, the first 61 s + 9 × 61 s = 610 s ago: one more once it is an hour old.
            await expect(requestEmailCode('louise@agency.test')).rejects.toMatchObject({
                code: 'EMAIL_CODE_LIMIT',
                retryAfter: 3600 - 610
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
            // Ten wrong, the first two minutes ago: codes are back once it is a day old.
            await expect(requestEmailCode('louise@agency.test')).rejects.toMatchObject({
                status: 429,
                code: 'EMAIL_CODE_LOCKED',
                retryAfter: 24 * 3600 - 122
            });
        } finally {
            vi.useRealTimers();
        }
    });

    it('says when a code is out of tries, and when the day’s wrong codes lock the address', async () => {
        vi.useFakeTimers({ now: Date.parse('2026-10-27T10:00:00Z') });
        try {
            await requestEmailCode('louise@agency.test');
            for (let i = 0; i < 4; i++)
                await expect(verifyEmailCode('louise@agency.test', '999999')).rejects.toMatchObject(
                    { code: 'EMAIL_CODE_WRONG' }
                );
            await expect(verifyEmailCode('louise@agency.test', '999999')).rejects.toMatchObject({
                status: 400,
                code: 'EMAIL_CODE_TRIES'
            });
            // Asked again, the used-up code still says so, not that it expired.
            await expect(verifyEmailCode('louise@agency.test', '999999')).rejects.toMatchObject({
                code: 'EMAIL_CODE_TRIES'
            });
            vi.advanceTimersByTime(61_000);
            await requestEmailCode('louise@agency.test');
            for (let i = 0; i < 4; i++)
                await verifyEmailCode('louise@agency.test', '999999').catch(() => undefined);
            vi.advanceTimersByTime(1000);
            await expect(verifyEmailCode('louise@agency.test', '999999')).rejects.toMatchObject({
                status: 429,
                code: 'EMAIL_CODE_LOCKED',
                retryAfter: 24 * 3600 - 62
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
            code: 'EMAIL_CODE_BUSY',
            retryAfter: expect.any(Number)
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
    describe('changing the sign-in email', () => {
        beforeEach(() => {
            const users = JSON.parse(fs.readFileSync(path.join(root, 'users.json'), 'utf8'));
            users.push({
                id: 'u2',
                email: 'theo@agency.test',
                isActive: true,
                roles: [],
                projects: []
            });
            fs.writeFileSync(path.join(root, 'users.json'), JSON.stringify(users));
            reloadUsers();
        });

        it('sends a code to the new address, and makes it the sign-in email', async () => {
            const heard: unknown[] = [];
            onEvent('auth.email.changed', e => void heard.push(e));
            await requestEmailChange('u1', ' Louise@New.test ');
            await sent();
            expect(mail.sent.at(-1)!.to).toEqual(['louise@new.test']);
            expect(mail.sent.at(-1)!.text).toContain('sign in to Moteur with this address');
            const before = getUserById('u1')!.authVersion ?? 0;
            const { user, previousEmail } = await confirmEmailChange(
                'u1',
                'louise@new.test',
                lastCode('louise@new.test')
            );
            expect(previousEmail).toBe('louise@agency.test');
            expect(user.email).toBe('louise@new.test');
            reloadUsers();
            expect(getUserById('u1')).toMatchObject({
                email: 'louise@new.test',
                authVersion: before + 1
            });
            expect(heard).toEqual([{ userId: 'u1' }]);
            // The old address hears of it.
            await sent();
            expect(mail.sent.at(-1)).toMatchObject({
                kind: 'email-changed',
                to: ['louise@agency.test'],
                data: { email: 'louise@agency.test', to: 'louise@new.test' }
            });
            // Used once.
            await expect(
                confirmEmailChange('u1', 'louise@new.test', lastCode('louise@new.test'))
            ).rejects.toMatchObject({ code: 'EMAIL_CODE_EXPIRED' });
        });

        it('refuses the same address, one another account has, and a bad one', async () => {
            await expect(requestEmailChange('u1', 'LOUISE@agency.test')).rejects.toMatchObject({
                status: 400,
                code: 'EMAIL_SAME'
            });
            await expect(requestEmailChange('u1', 'theo@agency.test')).rejects.toMatchObject({
                status: 409,
                code: 'EMAIL_TAKEN'
            });
            await expect(requestEmailChange('u1', 'nope')).rejects.toMatchObject({
                code: 'EMAIL_INVALID'
            });
        });

        it('keeps the sign-in code limits, and a code is for its own account only', async () => {
            vi.useFakeTimers({ now: Date.parse('2026-10-27T10:00:00Z') });
            try {
                await requestEmailChange('u1', 'louise@new.test');
                await expect(requestEmailChange('u1', 'louise@new.test')).rejects.toMatchObject({
                    status: 429,
                    code: 'EMAIL_CODE_WAIT',
                    retryAfter: 60
                });
                vi.advanceTimersByTime(1);
                await expect(
                    confirmEmailChange('u2', 'louise@new.test', lastCode('louise@new.test'))
                ).rejects.toMatchObject({ code: 'EMAIL_CODE_EXPIRED' });
                await expect(
                    confirmEmailChange('u1', 'louise@new.test', '000000')
                ).rejects.toMatchObject({ code: expect.stringMatching(/EMAIL_CODE_WRONG/) });
            } finally {
                vi.useRealTimers();
            }
        });

        it('needs a server that sends email', async () => {
            mail.off = true;
            await expect(requestEmailChange('u1', 'louise@new.test')).rejects.toMatchObject({
                status: 503,
                code: 'EMAIL_UNAVAILABLE'
            });
        });
    });
});
