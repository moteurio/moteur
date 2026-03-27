#!/usr/bin/env node

import { cliRegistry } from './registry.js';
import { showHelp, showCommandHelp } from './commands/help.js';
import { atelierCommand } from './commands/atelier.js';
import { formatError } from './utils/formatMessage.js';
import { parseArgs } from './utils/parseArgs.js';

import './commands/auth.js';
import './commands/projects.js';
import './commands/models.js';
import './commands/entries.js';
import './commands/layouts.js';
import './commands/structures.js';
import './commands/templates.js';
import './commands/pages.js';
import './commands/navigations.js';
import './commands/forms.js';
import './commands/submissions.js';
import './commands/comments.js';
import './commands/assets.js';
import './commands/webhooks.js';
import './commands/activity.js';
import './commands/doctor.js';
import './commands/status.js';
import './commands/radar.js';
import './commands/branches.js';
import './commands/seed.js';
import './commands/blocks.js';
import './commands/fields.js';
import './commands/userdata.js';
import './commands/blueprints.js';
import './commands/workspace.js';
import './commands/ai.js';

const [command, subcommand, ...rest] = process.argv.slice(2);
const args: Record<string, unknown> = parseArgs(rest);

// Global flags (every command receives these via args)
// --project=<id> --json --plain --quiet --debug --no-color
args.isTty = process.stdout.isTTY === true;
if (args.noColor === true || args['no-color'] === true) args.plain = true;

async function run(): Promise<void> {
    if (command === 'help' || command === '--help' || command === '-h') {
        if (command === 'help' && subcommand) showCommandHelp(subcommand);
        else showHelp();
        return;
    }
    if (!command) {
        await atelierCommand(args);
        return;
    }
    if (!cliRegistry.has(command)) {
        console.error('Unknown command:', command);
        showHelp();
        process.exit(1);
    }
    let cmdDef;
    try {
        cmdDef = cliRegistry.get(command, subcommand ?? '');
    } catch {
        showCommandHelp(command);
        process.exit(1);
    }
    try {
        await cmdDef.action(args);
    } catch (err) {
        console.error(formatError(err));
        process.exit(1);
    }
}

run();
