#!/usr/bin/env node
/**
 * Operators, from the server itself: the only way to add the first one.
 *
 *   moteur-operators list
 *   moteur-operators add you@example.com [--name "Your Name"]   prints their one-time link
 *   moteur-operators reset you@example.com                      new link; sign-in starts again
 *   moteur-operators remove you@example.com
 *
 * Reads the same settings as the API (DATA_ROOT, OPERATORS_FILE, JWT_SECRET or OPERATOR_SECRET,
 * STUDIO_URL for the link). Run it where the API's data is, as the user the API runs as.
 */
import {
    addOperator,
    listOperators,
    OperatorAuthError,
    removeOperator,
    resetOperator
} from '@moteurio/core/operators.js';
import { storageConfig } from '@moteurio/core/config/storageConfig.js';

// The API's .env, when run from where it lives.
try {
    process.loadEnvFile();
} catch {
    // No .env here: the environment has the settings.
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
                    `${o.email}  ${o.name}  (${state}, ${o.recoveryCodesLeft} recovery codes)`
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
        default:
            console.log(HELP);
            process.exitCode = command && command !== 'help' && command !== '--help' ? 2 : 0;
    }
} catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
}
