/**
 * Commands only the command line has: signing in and out (prompts, the config file), accounts made
 * straight in a local server's files, and checking the setup.
 */
import { password as passwordPrompt, text, isCancel } from '@clack/prompts';
import { createMoteurAdminClient } from '@moteurio/client';
import {
    clearConfig,
    group,
    isWebSessionMode,
    loadConfig,
    saveConfig,
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
            { name: 'password', description: 'Your password (asked when left out)', in: 'none' }
        ],
        offline: true,
        run: async ctx => {
            if (await isWebSessionMode())
                throw new UsageError('Signed in by the host (MOTEUR_TOKEN): nothing to do.');
            const config = await loadConfig();
            const apiUrl = String(
                ctx.args['api-url'] ?? config.apiUrl ?? 'http://localhost:3000'
            ).replace(/\/+$/, '');
            const email = (ctx.args.email as string | undefined) ?? (await ask('Email:'));
            const password =
                (ctx.args.password as string | undefined) ?? (await ask('Password:', true));
            const { token, user } = await createMoteurAdminClient({ baseURL: apiUrl }).auth.login(
                email,
                password
            );
            await saveConfig({ apiUrl, token, projectId: config.projectId });
            return { apiUrl, user };
        },
        covers: ['POST /auth/login'],
        done: r => `Signed in to ${(r as { apiUrl: string }).apiUrl}.`
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
            'Runs where the server’s data is (DATA_ROOT / AUTH_USERS_FILE). To add someone through the API, use moteur invites send.',
        args: [
            { name: 'email', description: 'Their email', in: 'none' },
            { name: 'password', description: 'Their password', in: 'none' },
            { name: 'name', description: 'Their name', in: 'none' },
            { name: 'project', description: 'Add them to this project', in: 'none' },
            { name: 'admin', type: 'boolean', description: 'Make them an admin', in: 'none' },
            {
                name: 'operator',
                type: 'boolean',
                description: 'Make them a server operator',
                in: 'none'
            }
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
