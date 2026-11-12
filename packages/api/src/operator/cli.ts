#!/usr/bin/env node
/**
 * Command line for managing operators, run on the server itself. It is the only way to add the first operator.
 *
 *   moteur-operators list
 *   moteur-operators add you@example.com [--name "Your Name"]   prints the operator's one-time link
 *   moteur-operators reset you@example.com                      issues a new link and restarts sign-in setup
 *   moteur-operators remove you@example.com
 *   moteur-operators news you@example.com each|daily|off           how the operator is emailed about news
 *   moteur-operators create-user you@example.com --name "Your Name" [--password …]   a user account
 *
 * create-user makes the first account on a new server, before anyone can sign in. After that, use
 * `moteur operator create-user`, which goes through the API and works from any machine.
 *
 * Reads the same settings as the API (DATA_ROOT, OPERATORS_FILE, JWT_SECRET or OPERATOR_SECRET,
 * STUDIO_URL for the link). Run it on the machine that holds the API's data, as the user the API runs as.
 */
import {
    addOperator,
    listOperators,
    OperatorAuthError,
    removeOperator,
    resetOperator,
    setOperatorNews,
    OPERATOR_NEWS_MODES,
    type OperatorNewsMode
} from '@moteurio/core/operators.js';
import { storageConfig } from '@moteurio/core/config/storageConfig.js';
import { createUser, getUserByEmail } from '@moteurio/core/users.js';
import { hashPassword, passwordProblem } from '@moteurio/core/auth.js';
import { randomUUID } from 'node:crypto';

// Load the API's .env file when run from the directory that contains it.
try {
    process.loadEnvFile();
} catch {
    // There is no .env file, so the settings come from the environment.
}

const [command, target, ...rest] = process.argv.slice(2);
const flag = (name: string) => {
    const i = rest.indexOf(`--${name}`);
    return i >= 0 ? rest[i + 1] : undefined;
};

function link(token: string): string {
    const studio = (process.env.STUDIO_URL ?? '').trim().replace(/\/+$/, '');
    const path = `/operator/enroll/${token}`;
    return studio
        ? `${studio}${path}`
        : `<your Studio>${path}   (set STUDIO_URL to print the full link)`;
}

function find(emailOrId: string | undefined) {
    const o = listOperators().find(x => x.id === emailOrId || x.email === emailOrId?.toLowerCase());
    if (!o) throw new OperatorAuthError(`No operator ${emailOrId ?? ''}`.trim(), 404);
    return o;
}

const HELP = `moteur-operators: the people who run this server (not users).

  list                         who they are
  add <email> [--name <name>]  add one; prints their one-time link (24 hours)
  reset <email>                their sign-in starts again; prints a new link
  remove <email>               their sessions end at once
  news <email> each|daily|off  how they hear about new accounts, projects and workspaces:
                               an email each time (default), a daily summary, or none

  create-user <email> --name <name> [--password <password>]
                               a user account, for the first one on a new server; without
                               a password they sign in with an email code. Afterwards, use
                               moteur operator create-user from any machine.

Operators file: ${storageConfig.operatorsFile}`;

try {
    switch (command) {
        case 'list': {
            const all = listOperators();
            if (!all.length) console.log('No operators yet: moteur-operators add you@example.com');
            for (const o of all) {
                const state = o.enrolled
                    ? `signed in ${o.lastLoginAt ?? 'never'}`
                    : 'link not used yet';
                console.log(
                    `${o.email}  ${o.name}  (${state}, ${o.recoveryCodesLeft} recovery codes, news: ${o.news})`
                );
            }
            break;
        }
        case 'add': {
            if (!target)
                throw new OperatorAuthError(
                    'Which email? moteur-operators add you@example.com',
                    400
                );
            const name = flag('name');
            const { operator, token } = addOperator(
                { email: target, ...(name ? { name } : {}) },
                'server'
            );
            console.log(
                `Added ${operator.email}. Their one-time link (24 hours, keep it private):\n\n  ${link(token)}\n`
            );
            console.log('There they choose a password and add Moteur to an authenticator app.');
            break;
        }
        case 'reset': {
            const { operator, token } = resetOperator(find(target).id);
            console.log(
                `${operator.email} must set up their sign-in again (sessions ended):\n\n  ${link(token)}\n`
            );
            break;
        }
        case 'remove': {
            const o = find(target);
            removeOperator(o.id);
            console.log(`Removed ${o.email}.`);
            break;
        }
        case 'news': {
            const o = find(target);
            const mode = rest[0] as OperatorNewsMode;
            if (!OPERATOR_NEWS_MODES.includes(mode))
                throw new OperatorAuthError(
                    `How? moteur-operators news ${o.email} ${OPERATOR_NEWS_MODES.join('|')}`,
                    400
                );
            setOperatorNews(o.id, mode);
            console.log(
                mode === 'off'
                    ? `${o.email} gets no news by email.`
                    : mode === 'daily'
                      ? `${o.email} gets a daily summary, when something happened.`
                      : `${o.email} gets an email for each new account, project and workspace.`
            );
            break;
        }
        case 'create-user': {
            if (!target)
                throw new OperatorAuthError(
                    'Which email? moteur-operators create-user you@example.com --name "Your Name"',
                    400
                );
            const email = target.trim();
            const name = flag('name')?.trim();
            const password = flag('password') ?? '';
            if (!name) throw new OperatorAuthError('A name is required: --name "Your Name"', 400);
            const weak = password ? passwordProblem(password) : null;
            if (weak) throw new OperatorAuthError(weak, 400);
            if (getUserByEmail(email))
                throw new OperatorAuthError(`There is already an account for ${email}.`, 409);
            const user = await createUser({
                id: `user:${randomUUID()}`,
                email,
                name,
                ...(password && { passwordHash: await hashPassword(password) }),
                roles: [],
                projects: [],
                isActive: true
            });
            console.log(
                password
                    ? `Created ${user.email}. They can sign in with their password.`
                    : `Created ${user.email}. They sign in with a code sent by email.`
            );
            break;
        }
        default:
            console.log(HELP);
            process.exitCode = command && command !== 'help' && command !== '--help' ? 2 : 0;
    }
} catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
}
