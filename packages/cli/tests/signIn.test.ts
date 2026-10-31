import { describe, it, expect } from 'vitest';
import { UsageError } from '@moteurio/commands';
import { readSignInLink, signIn, signInWords } from '../src/commands/session.js';

/** A server's auth routes, recording what was asked of them. */
function server(
    over: {
        emailCodes?: boolean;
        twoFactor?: boolean;
        isNew?: boolean;
        /** Refusals, in order, for each route before it answers. */
        fail?: Partial<
            Record<'login' | 'emailCode' | 'verifyEmailCode' | 'verifyTwoFactor', object[]>
        >;
    } = {}
) {
    const calls: [string, unknown][] = [];
    const refuse = (route: keyof NonNullable<typeof over.fail>) => {
        const next = over.fail?.[route]?.shift();
        if (next) throw Object.assign(new Error('refused'), next);
    };
    const done = (twoFactor = over.twoFactor) =>
        twoFactor ? { twoFactor: true as const, ticket: 't1' } : null;
    const auth = {
        signup: async () => ({ open: true, emailCodes: over.emailCodes ?? true }),
        login: async (username: string, password: string) => {
            calls.push(['login', { username, password }]);
            refuse('login');
            return done() ?? { token: 'pw-token', user: { id: 'u1' } };
        },
        emailCode: async (input: { email: string }) => {
            calls.push(['emailCode', input]);
            refuse('emailCode');
            return { sent: true as const };
        },
        verifyEmailCode: async (input: { email: string; code?: string; token?: string }) => {
            calls.push(['verifyEmailCode', input]);
            refuse('verifyEmailCode');
            return done() ?? { token: 'code-token', isNew: over.isNew ?? false };
        },
        verifyTwoFactor: async (ticket: string, code: string) => {
            calls.push(['verifyTwoFactor', { ticket, code }]);
            refuse('verifyTwoFactor');
            return { token: '2fa-token', user: { id: 'u1' }, usedRecovery: false };
        }
    };
    return { auth: auth as never, calls };
}

/** Keeps the progress lines instead of printing them. */
function lines() {
    const said: string[] = [];
    return { tell: (line: string) => void said.push(line), said };
}

/** Answers prompts in order, keeping the questions. */
function answers(...replies: string[]) {
    const asked: string[] = [];
    const prompt = async (message: string) => {
        asked.push(message);
        if (!replies.length) throw new Error(`Unexpected prompt: ${message}`);
        return replies.shift()!;
    };
    return { prompt, asked };
}

describe('auth login', () => {
    it('signs in with a password, as before', async () => {
        const { auth, calls } = server();
        const { prompt } = answers('louise@example.com', 'secret-pass');
        expect(await signIn(auth, {}, prompt, lines().tell)).toEqual({
            token: 'pw-token',
            user: { id: 'u1' },
            isNew: false
        });
        expect(calls).toEqual([
            ['login', { username: 'louise@example.com', password: 'secret-pass' }]
        ]);
    });

    it('sends a code when the password is left empty, and takes it with spaces', async () => {
        const { auth, calls } = server();
        const { prompt, asked } = answers('sophie@example.com', '', '123 456');
        const r = await signIn(auth, {}, prompt, lines().tell);
        expect(r).toEqual({ token: 'code-token', user: undefined, isNew: false });
        expect(asked[1]).toBe('Password (leave empty to email me a sign-in code):');
        expect(calls).toEqual([
            ['emailCode', { email: 'sophie@example.com' }],
            ['verifyEmailCode', { email: 'sophie@example.com', code: '123456' }]
        ]);
    });

    it('takes the email’s sign-in link in place of the code', async () => {
        const { auth, calls } = server();
        const link =
            'https://studio.example.com/auth/email#email=sophie%40example.com&token=abc123';
        const { prompt } = answers(link);
        await signIn(auth, { email: 'sophie@example.com', emailCode: true }, prompt, lines().tell);
        expect(calls.at(-1)).toEqual([
            'verifyEmailCode',
            { email: 'sophie@example.com', token: 'abc123' }
        ]);
    });

    it('says when a code made the account', async () => {
        const { auth } = server({ isNew: true });
        const { prompt } = answers('000000');
        expect(
            (
                await signIn(
                    auth,
                    { email: 'new@example.com', emailCode: true },
                    prompt,
                    lines().tell
                )
            ).isNew
        ).toBe(true);
    });

    it('asks for the authenticator after a code too', async () => {
        const { auth, calls } = server({ twoFactor: true });
        const { prompt } = answers('123456', '654321');
        const r = await signIn(
            auth,
            { email: 'louise@example.com', emailCode: true },
            prompt,
            lines().tell
        );
        expect(r.token).toBe('2fa-token');
        expect(calls.at(-1)).toEqual(['verifyTwoFactor', { ticket: 't1', code: '654321' }]);
    });

    it('only asks for a password where the server sends no email', async () => {
        const { auth } = server({ emailCodes: false });
        const { prompt, asked } = answers('');
        await expect(
            signIn(auth, { email: 'a@example.com' }, prompt, lines().tell)
        ).rejects.toBeInstanceOf(UsageError);
        expect(asked).toEqual(['Password:']);
    });
});

describe('auth login, in the sign-in page’s words', () => {
    it('says what it is doing, and asks again after a wrong code', async () => {
        const { auth, calls } = server({
            fail: { verifyEmailCode: [{ code: 'EMAIL_CODE_WRONG' }] }
        });
        const { prompt, asked } = answers('111111', '222222');
        const { tell, said } = lines();
        await signIn(auth, { email: 'sophie@example.com', emailCode: true }, prompt, tell);
        expect(said).toEqual([
            'Sending…',
            'Check your email. We sent a sign-in code to sophie@example.com.',
            'Signing in…',
            'That code isn’t right. Check the email and try again.',
            'Signing in…'
        ]);
        expect(asked).toEqual([
            'Code (or paste the email’s link; r to send another):',
            'Code (or paste the email’s link; r to send another):'
        ]);
        expect(calls.filter(c => c[0] === 'verifyEmailCode')).toHaveLength(2);
    });

    it('sends another on r, and says how long to wait when it is too soon', async () => {
        const { auth, calls } = server({
            fail: {
                emailCode: [
                    undefined as never,
                    { code: 'EMAIL_CODE_WAIT', data: { retryAfter: 42 } }
                ]
            }
        });
        const { prompt } = answers('r', 'r', '', '123456');
        const { tell, said } = lines();
        await signIn(auth, { email: 'sophie@example.com', emailCode: true }, prompt, tell);
        expect(calls.filter(c => c[0] === 'emailCode')).toHaveLength(3);
        expect(said).toContain('We just sent one. Wait 42 s for the next.');
        expect(said).toContain('Nothing yet? Look in your spam folder.');
    });

    it('asks again once a code is out of tries, and says so', async () => {
        const { auth } = server({ fail: { verifyEmailCode: [{ code: 'EMAIL_CODE_TRIES' }] } });
        const { prompt } = answers('111111', 'r', '123456');
        const { tell, said } = lines();
        await signIn(auth, { email: 'a@example.com', emailCode: true }, prompt, tell);
        expect(said).toContain('That was the last try for this code. Send another.');
    });

    it('stops with the words when codes are off for the day', async () => {
        const { auth } = server({
            fail: { verifyEmailCode: [{ code: 'EMAIL_CODE_LOCKED', data: { retryAfter: 7200 } }] }
        });
        const { prompt } = answers('111111');
        await expect(
            signIn(auth, { email: 'a@example.com', emailCode: true }, prompt, lines().tell)
        ).rejects.toThrow(
            'Too many wrong codes for this address today. Try again in 2 h, or use the link in the email.'
        );
    });

    it('says how long to wait after wrong passwords', async () => {
        const { auth } = server({
            fail: { login: [{ code: 'LOGIN_SLOWED', data: { retryAfter: 4 } }] }
        });
        const { prompt } = answers('wrong-pass');
        const err = await signIn(auth, { email: 'a@example.com' }, prompt, lines().tell).catch(
            e => e
        );
        expect(err).toBeInstanceOf(UsageError);
        expect(err.message).toBe('Too many tries. Wait 4 s, then try again.');
    });

    it('asks the authenticator again after a wrong code', async () => {
        const { auth, calls } = server({
            twoFactor: true,
            fail: { verifyTwoFactor: [{ code: 'TWO_FACTOR_INVALID' }] }
        });
        const { prompt, asked } = answers('123456', '000000', '654321');
        const { tell, said } = lines();
        const r = await signIn(auth, { email: 'a@example.com', emailCode: true }, prompt, tell);
        expect(r.token).toBe('2fa-token');
        expect(asked.at(-1)).toBe(
            'Enter the code your authenticator app shows for Moteur (or a recovery code):'
        );
        expect(said).toContain('That code isn’t right. Try the one the app shows now.');
        expect(calls.filter(c => c[0] === 'verifyTwoFactor')).toHaveLength(2);
    });

    it('words every refusal with its wait', () => {
        const w = (code: string, retryAfter?: number) =>
            signInWords({ code, ...(retryAfter && { data: { retryAfter } }) });
        expect(w('EMAIL_INVALID')).toBe('That doesn’t look like an email address.');
        expect(w('EMAIL_CODE_WAIT')).toBe('We just sent one. Wait a minute for the next.');
        expect(w('EMAIL_CODE_LIMIT', 1500)).toBe(
            'That’s a lot of codes for one address. Try again in 25 min.'
        );
        expect(w('EMAIL_CODE_EXPIRED')).toBe('That code has expired. Send another.');
        expect(w('EMAIL_CODE_BUSY')).toBe(
            'Many codes are going out right now. Try again in a few minutes.'
        );
        expect(w('EMAIL_UNAVAILABLE')).toMatch(/^This server can’t send email\./);
        expect(w('TWO_FACTOR_EXPIRED')).toBe('That took too long. Sign in again.');
        expect(w('SOMETHING_ELSE')).toBeUndefined();
    });
});

describe('sign-in links', () => {
    it('reads the email and token after the #', () => {
        expect(readSignInLink('https://s.example/auth/email#email=a%40b.c&token=xyz')).toEqual({
            email: 'a@b.c',
            token: 'xyz'
        });
    });

    it('leaves codes and other text alone', () => {
        expect(readSignInLink('123456')).toBeUndefined();
        expect(readSignInLink('https://s.example/auth/email')).toBeUndefined();
    });
});
