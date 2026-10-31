/**
 * Commands only the command line has: signing in and out (prompts, the config file), accounts made
 * straight in a local server's files, and checking the setup.
 */
import { URL, URLSearchParams } from 'node:url';
import { password as passwordPrompt, text, isCancel, log } from '@clack/prompts';
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

/** A line of progress while signing in ("Sending…"), apart from the questions. */
type Say = (line: string) => void;
const say: Say = line => log.message(line);

export interface SignInGiven {
    email?: string;
    password?: string;
    /** The authenticator's code, with two-step sign-in. */
    code?: string;
    /** Skip the password: get a code by email. */
    emailCode?: boolean;
}

/** A wait in seconds as whole minutes, at least one. */
function minutes(seconds: number): number {
    return Math.max(1, Math.ceil(seconds / 60));
}

/** The machine code and the wait (seconds) of a refusal from the API, when it has them. */
function refusal(err: unknown): { code?: string; wait?: number } {
    const e = err as { code?: unknown; data?: { retryAfter?: unknown }; retryAfter?: unknown };
    const wait = Number(e?.data?.retryAfter ?? e?.retryAfter);
    return {
        code: typeof e?.code === 'string' ? e.code : undefined,
        wait: Number.isFinite(wait) && wait > 0 ? Math.ceil(wait) : undefined
    };
}

/**
 * What to tell someone when the server refuses a step of signing in: the web sign-in page's
 * words for the same refusal, with the wait the server gave. Undefined for anything else.
 */
export function signInWords(err: unknown): string | undefined {
    const { code, wait } = refusal(err);
    switch (code) {
        case 'EMAIL_INVALID':
            return 'That doesn’t look like an email address.';
        case 'EMAIL_CODE_WAIT':
            return wait
                ? `We just sent one. Wait ${wait} s for the next.`
                : 'We just sent one. Wait a minute for the next.';
        case 'EMAIL_CODE_LIMIT':
            return wait
                ? `That’s a lot of codes for one address. Try again in ${minutes(wait)} min.`
                : 'That’s a lot of codes for one address. Try again in an hour.';
        case 'EMAIL_UNAVAILABLE':
            return 'This server can’t send email. Sign in with your password instead.';
        case 'EMAIL_CODE_WRONG':
            return 'That code isn’t right. Check the email and try again.';
        case 'EMAIL_CODE_EXPIRED':
            return 'That code has expired. Send another.';
        case 'EMAIL_LINK_EXPIRED':
            return 'That link has expired. Send another code.';
        case 'EMAIL_CODE_TRIES':
            return 'That was the last try for this code. Send another.';
        case 'EMAIL_CODE_LOCKED':
            return wait
                ? `Too many wrong codes for this address today. Try again in ${Math.max(1, Math.ceil(wait / 3600))} h, or use the link in the email.`
                : 'Too many wrong codes for this address today. Try again tomorrow, or use the link in the email.';
        case 'EMAIL_CODE_BUSY':
            return 'Many codes are going out right now. Try again in a few minutes.';
        case 'LOGIN_SLOWED':
            return `Too many tries. Wait ${wait ?? 30} s, then try again.`;
        case 'rate_limited':
            return wait && wait > 90
                ? `Too many tries. Try again in ${minutes(wait)} min.`
                : `Too many tries. Wait ${wait ?? 60} s, then try again.`;
        case 'TWO_FACTOR_INVALID':
            return 'That code isn’t right. Try the one the app shows now.';
        case 'TWO_FACTOR_EXPIRED':
            return 'That took too long. Sign in again.';
        default:
            return undefined;
    }
}

/** The refusal in the sign-in page's words, when it has some; else the error as it came. */
function plainly(err: unknown): unknown {
    const words = signInWords(err);
    return words ? new UsageError(words) : err;
}

/** Refusals at the code prompt that leave the person there, to try again or send another. */
const RETRY_CODE = [
    'EMAIL_CODE_WRONG',
    'EMAIL_CODE_EXPIRED',
    'EMAIL_CODE_TRIES',
    'EMAIL_LINK_EXPIRED'
];
/** Refusals of another code that leave the person at the prompt with the one they have. */
const WAIT_FOR_CODE = ['EMAIL_CODE_WAIT', 'EMAIL_CODE_LIMIT', 'EMAIL_CODE_BUSY', 'rate_limited'];

/**
 * The email-code steps, as on the web sign-in page: send the code, then ask for it (or the
 * email's link) until it is right. `r` sends another; an empty answer points at the spam folder.
 */
async function codeSignIn(
    auth: AuthApi,
    email: string,
    prompt: Ask,
    tell: Say
): Promise<Awaited<ReturnType<AuthApi['verifyEmailCode']>>> {
    const send = async () => {
        tell('Sending…');
        await auth.emailCode({ email });
        tell(`Check your email. We sent a sign-in code to ${email}.`);
    };
    await send().catch(err => {
        throw plainly(err);
    });
    for (;;) {
        const answer = await prompt('Code (or paste the email’s link; r to send another):');
        if (/^r$/i.test(answer)) {
            try {
                await send();
            } catch (err) {
                if (!WAIT_FOR_CODE.includes(refusal(err).code ?? '')) throw plainly(err);
                tell(signInWords(err)!);
            }
            continue;
        }
        if (!answer) {
            tell('Nothing yet? Look in your spam folder.');
            continue;
        }
        const link = readSignInLink(answer);
        tell('Signing in…');
        try {
            return await auth.verifyEmailCode(link ?? { email, code: answer.replace(/\s+/g, '') });
        } catch (err) {
            if (!RETRY_CODE.includes(refusal(err).code ?? '')) throw plainly(err);
            tell(signInWords(err)!);
        }
    }
}

/**
 * Signs in with a password or, left empty, a code sent by email (or the email's link pasted in
 * its place): accounts made with a code have no password. Two-step sign-in follows either way.
 * On a server open to sign-ups, a code for a new address makes the account (`isNew`). The steps
 * and refusals use the web sign-in page's words.
 */
export async function signIn(
    auth: AuthApi,
    given: SignInGiven,
    prompt: Ask = ask,
    tell: Say = say
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
            codes ? 'Password (leave empty to email me a sign-in code):' : 'Password:',
            true
        );
        if (!password && !codes) throw new UsageError('Password is required');
    }

    let result: Awaited<ReturnType<AuthApi['login']>> | { token: string; isNew: boolean };
    let isNew = false;
    if (password) {
        result = await auth.login(email, password).catch(err => {
            throw plainly(err);
        });
    } else {
        const verified = await codeSignIn(auth, email, prompt, tell);
        if ('token' in verified) isNew = verified.isNew;
        result = verified;
    }
    if ('twoFactor' in result) {
        const ticket = result.ticket;
        for (;;) {
            const code =
                given.code ??
                (await prompt(
                    'Enter the code your authenticator app shows for Moteur (or a recovery code):'
                ));
            try {
                result = await auth.verifyTwoFactor(ticket, code);
                break;
            } catch (err) {
                // A code given on the command line is not asked again.
                if (given.code || refusal(err).code !== 'TWO_FACTOR_INVALID') throw plainly(err);
                tell(signInWords(err)!);
            }
        }
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
        description:
            'With the password left empty, a sign-in code comes by email. At the code prompt, paste the email’s link instead of the code, type r to send another, or press Enter for a hint. A wrong or expired code asks again; waits say how long (“We just sent one. Wait 42 s for the next.”).',
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
