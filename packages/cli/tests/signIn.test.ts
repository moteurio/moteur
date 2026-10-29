import { describe, it, expect } from 'vitest';
import { UsageError } from '@moteurio/commands';
import { readSignInLink, signIn } from '../src/commands/session.js';

/** A server's auth routes, recording what was asked of them. */
function server(over: { emailCodes?: boolean; twoFactor?: boolean; isNew?: boolean } = {}) {
    const calls: [string, unknown][] = [];
    const done = (twoFactor = over.twoFactor) =>
        twoFactor ? { twoFactor: true as const, ticket: 't1' } : null;
    const auth = {
        signup: async () => ({ open: true, emailCodes: over.emailCodes ?? true }),
        login: async (username: string, password: string) => {
            calls.push(['login', { username, password }]);
            return done() ?? { token: 'pw-token', user: { id: 'u1' } };
        },
        emailCode: async (input: { email: string }) => {
            calls.push(['emailCode', input]);
            return { sent: true as const };
        },
        verifyEmailCode: async (input: { email: string; code?: string; token?: string }) => {
            calls.push(['verifyEmailCode', input]);
            return done() ?? { token: 'code-token', isNew: over.isNew ?? false };
        },
        verifyTwoFactor: async (ticket: string, code: string) => {
            calls.push(['verifyTwoFactor', { ticket, code }]);
            return { token: '2fa-token', user: { id: 'u1' }, usedRecovery: false };
        }
    };
    return { auth: auth as never, calls };
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
        expect(await signIn(auth, {}, prompt)).toEqual({
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
        const r = await signIn(auth, {}, prompt);
        expect(r).toEqual({ token: 'code-token', user: undefined, isNew: false });
        expect(asked[1]).toBe('Password (leave empty for a code by email):');
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
        await signIn(auth, { email: 'sophie@example.com', emailCode: true }, prompt);
        expect(calls.at(-1)).toEqual([
            'verifyEmailCode',
            { email: 'sophie@example.com', token: 'abc123' }
        ]);
    });

    it('says when a code made the account', async () => {
        const { auth } = server({ isNew: true });
        const { prompt } = answers('000000');
        expect(
            (await signIn(auth, { email: 'new@example.com', emailCode: true }, prompt)).isNew
        ).toBe(true);
    });

    it('asks for the authenticator after a code too', async () => {
        const { auth, calls } = server({ twoFactor: true });
        const { prompt } = answers('123456', '654321');
        const r = await signIn(auth, { email: 'louise@example.com', emailCode: true }, prompt);
        expect(r.token).toBe('2fa-token');
        expect(calls.at(-1)).toEqual(['verifyTwoFactor', { ticket: 't1', code: '654321' }]);
    });

    it('only asks for a password where the server sends no email', async () => {
        const { auth } = server({ emailCodes: false });
        const { prompt, asked } = answers('');
        await expect(signIn(auth, { email: 'a@example.com' }, prompt)).rejects.toBeInstanceOf(
            UsageError
        );
        expect(asked).toEqual(['Password:']);
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
