/**
 * Commands only the command line has: signing in and out (prompts, the config file), accounts made
 * straight in a local server's files, and checking the setup.
 */
import { URL, URLSearchParams } from 'node:url';
import { password as passwordPrompt, text, isCancel } from '@clack/prompts';
import { createMoteurAdminClient, type MoteurAdminClient } from '@moteurio/client';
import {
    clearConfig,
    group,
    isWebSessionMode,
    loadConfig,
    readOperatorSession,
    saveConfig,
    saveOperatorSession,
    UsageError
} from '@moteurio/commands';
import { createUserCommand, resetPasswordCommand } from './local.js';
import { doctorChecks } from './doctor.js';

async function ask(message: string, secret = false): Promise<string> {
    if (!process.stdin.isTTY) throw new UsageError(`${message.replace(/:$/, '')} is required`);
    const value = secret ? await passwordPrompt({ message }) : await text({ message });
    if (isCancel(value)) throw new UsageError('Cancelled.');
    return String(value ?? '').trim();
}

type Ask = typeof ask;

/** The email and token after the `#` of a code email's sign-in link, when that's what was pasted. */
export function readSignInLink(value: string): { email: string; token: string } | undefined {
    if (!/^https?:\/\//i.test(value)) return undefined;
    try {
        const params = new URLSearchParams(new URL(value).hash.slice(1));
        const email = params.get('email');
        const token = params.get('token');
        return email && token ? { email, token } : undefined;
    } catch {
        return undefined;
    }
}

type AuthApi = Pick<
    MoteurAdminClient['auth'],
    'login' | 'verifyTwoFactor' | 'signup' | 'emailCode' | 'verifyEmailCode'
>;

export interface SignInGiven {
    email?: string;
    password?: string;
    /** The authenticator's code, with two-step sign-in. */
    code?: string;
    /** Skip the password: get a code by email. */
    emailCode?: boolean;
}

/**
 * Signs in with a password or, left empty, a code sent by email (or the email's link pasted in
 * its place): accounts made with a code have no password. Two-step sign-in follows either way.
 * On a server open to sign-ups, a code for a new address makes the account (`isNew`).
 */
export async function signIn(
    auth: AuthApi,
    given: SignInGiven,
    prompt: Ask = ask
): Promise<{ token: string; user?: Record<string, unknown>; isNew: boolean }> {
    const email = given.email ?? (await prompt('Email:'));
    let password = given.emailCode ? '' : given.password;
    if (password === undefined) {
        // A server without email (or from before codes) answers false, or not at all.
        const codes = await auth.signup().then(
            s => s.emailCodes,
            () => false
        );
        password = await prompt(
            codes ? 'Password (leave empty for a code by email):' : 'Password:',
            true
        );
        if (!password && !codes) throw new UsageError('Password is required');
    }

    let result: Awaited<ReturnType<AuthApi['login']>> | { token: string; isNew: boolean };
    let isNew = false;
    if (password) {
        result = await auth.login(email, password);
    } else {
        await auth.emailCode({ email });
        const answer = await prompt(`Code sent to ${email} (or paste the email's link):`);
        const link = readSignInLink(answer);
        const verified = await auth.verifyEmailCode(
            link ?? { email, code: answer.replace(/\s+/g, '') }
        );
        if ('token' in verified) isNew = verified.isNew;
        result = verified;
    }
    if ('twoFactor' in result) {
        const code =
            given.code ?? (await prompt('Code from your authenticator app (or a recovery code):'));
        result = await auth.verifyTwoFactor(result.ticket, code);
    }
    return { token: result.token, user: 'user' in result ? result.user : undefined, isNew };
}

/**
 * Operators sign in apart from people: password and authenticator code, an hour long, kept in
 * ~/.moteur/operator.json (only you can read it). Operator commands use it, never `auth login`.
 */
export const operatorSession = group('operator', [
    {
        name: 'login',
        summary: 'Sign in as an operator (password and authenticator code), for an hour',
        args: [
            {
                name: 'api-url',
                description: 'The API (default: the one you signed in to)',
                in: 'none',
                aliases: ['apiUrl']
            },
            { name: 'email', description: 'Your operator email', in: 'none' }
        ],
        offline: true,
        run: async ctx => {
            const config = await loadConfig();
            const apiUrl = String(
                ctx.args['api-url'] ?? config.apiUrl ?? 'http://localhost:3000'
            ).replace(/\/+$/, '');
            const email = (ctx.args.email as string | undefined) ?? (await ask('Operator email:'));
            const password = await ask('Password:', true);
            const code = await ask('Authenticator code (or a recovery code):');
            const s = await createMoteurAdminClient({ baseURL: apiUrl }).post<{
                token: string;
                expiresAt: string;
                operator: { email: string };
                recoveryCodeUsed?: boolean;
            }>('/operator/auth/login', { email, password, code });
            saveOperatorSession({
                apiUrl,
                token: s.token,
                expiresAt: s.expiresAt,
                email: s.operator.email
            });
            return {
                apiUrl,
                email: s.operator.email,
                expiresAt: s.expiresAt,
                recoveryCodeUsed: s.recoveryCodeUsed
            };
        },
        covers: ['POST /operator/auth/login'],
        done: r => {
            const s = r as { email: string; expiresAt: string; recoveryCodeUsed?: boolean };
            const until = new Date(s.expiresAt).toLocaleTimeString([], {
                hour: 'numeric',
                minute: '2-digit'
            });
            return `Signed in as operator ${s.email} until ${until}.${s.recoveryCodeUsed ? ' You used a recovery code: you have one less.' : ''}`;
        }
    },
    {
        name: 'logout',
        summary: 'End the operator session on this machine',
        offline: true,
        run: async () => {
            saveOperatorSession(null);
            return null;
        },
        done: () => 'Operator session ended.'
    },
    {
        name: 'whoami',
        summary: 'Which operator is signed in here, and until when',
        offline: true,
        run: async () => {
            const s = readOperatorSession();
            if (!s) throw new UsageError('No operator session: moteur operator login');
            return { email: s.email, expiresAt: s.expiresAt, apiUrl: s.apiUrl };
        },
        done: r => {
            const s = r as { email: string; expiresAt: string; apiUrl: string };
            return `${s.email || 'MOTEUR_OPERATOR_TOKEN'} on ${s.apiUrl}${s.expiresAt ? `, until ${s.expiresAt}` : ''}`;
        }
    }
]);

export const session = group('auth', [
    {
        name: 'login',
        summary: 'Sign in to a Moteur API and remember it',
        args: [
            {
                name: 'api-url',
                description: 'The API (default: the last one, or http://localhost:3000)',
                in: 'none',
                aliases: ['apiUrl']
            },
            { name: 'email', description: 'Your email', in: 'none', aliases: ['username'] },
            {
                name: 'password',
                description:
                    'Your password (asked when left out; leave it empty for a code by email)',
                in: 'none'
            },
            {
                name: 'email-code',
                type: 'boolean',
                description:
                    'No password: get a code by email (accounts made with a code have none)',
                in: 'none',
                aliases: ['emailCode']
            },
            {
                name: 'code',
                description: 'With two-step sign-in: the app’s code (asked when left out)',
                in: 'none'
            }
        ],
        offline: true,
        run: async ctx => {
            if (await isWebSessionMode())
                throw new UsageError('Signed in by the host (MOTEUR_TOKEN): nothing to do.');
            const config = await loadConfig();
            const apiUrl = String(
                ctx.args['api-url'] ?? config.apiUrl ?? 'http://localhost:3000'
            ).replace(/\/+$/, '');
            const signedIn = await signIn(createMoteurAdminClient({ baseURL: apiUrl }).auth, {
                email: ctx.args.email as string | undefined,
                password: ctx.args.password as string | undefined,
                code: ctx.args.code as string | undefined,
                emailCode: ctx.args['email-code'] === true
            });
            const { token, isNew } = signedIn;
            // A code's answer carries no user: ask with the new session.
            const user =
                signedIn.user ??
                (
                    await createMoteurAdminClient({
                        baseURL: apiUrl,
                        auth: { type: 'bearer', token }
                    }).auth.me()
                ).user;
            await saveConfig({ apiUrl, token, projectId: config.projectId });
            return { apiUrl, user, isNew };
        },
        covers: [
            'POST /auth/login',
            'POST /auth/two-factor/verify',
            'GET /auth/signup',
            'POST /auth/email/code',
            'POST /auth/email/verify'
        ],
        done: r => {
            const { apiUrl, isNew } = r as { apiUrl: string; isNew: boolean };
            return isNew ? `Account made, and signed in to ${apiUrl}.` : `Signed in to ${apiUrl}.`;
        }
    },
    {
        name: 'logout',
        summary: 'Forget the sign-in',
        offline: true,
        run: async () => {
            if (await isWebSessionMode())
                throw new UsageError('Signed in by the host (MOTEUR_TOKEN): nothing to forget.');
            await clearConfig();
            return null;
        },
        done: () => 'Signed out.'
    },
    {
        name: 'create-user',
        summary: 'Create an account straight in a local server’s files (no API)',
        description:
            'Runs where the server’s data is (DATA_ROOT / AUTH_USERS_FILE). To add someone through the API, use moteur invites send. Operators are not users: add them with moteur-operators on the server.',
        args: [
            { name: 'email', description: 'Their email', in: 'none' },
            { name: 'password', description: 'Their password', in: 'none' },
            { name: 'name', description: 'Their name', in: 'none' },
            { name: 'project', description: 'Add them to this project', in: 'none' }
        ],
        offline: true,
        run: async ctx => {
            await createUserCommand(ctx.args);
            return '';
        }
    },
    {
        name: 'reset-password',
        summary: 'Set a password straight in a local server’s files (no API)',
        args: [
            { name: 'user', description: 'Email or user id', in: 'none' },
            { name: 'password', description: 'The new password', in: 'none' }
        ],
        offline: true,
        run: async ctx => {
            await resetPasswordCommand(ctx.args);
            return '';
        }
    }
]);

export const doctor = group('doctor', [
    {
        name: '',
        summary: 'Check the setup: config, API reachable, signed in, default project',
        offline: true,
        run: async ctx => {
            const checks = await doctorChecks(ctx.args);
            if (!checks.every(c => c.ok)) process.exitCode = 1;
            return { ok: checks.every(c => c.ok), checks };
        },
        done: r =>
            (r as { checks: { name: string; ok: boolean; hint?: string }[] }).checks
                .map(
                    c =>
                        `${c.ok ? '✓' : '✗'} ${c.name}${!c.ok && c.hint ? `\n    → ${c.hint}` : ''}`
                )
                .join('\n')
    }
]);
