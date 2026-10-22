#!/usr/bin/env node
import { createRequire } from 'module';
import { commands } from './commands/index.js';
import { runCommand } from './framework/run.js';
import chalk from 'chalk';
import { commandHelp, groupHelp, overviewHelp } from './framework/help.js';

const argv = process.argv.slice(2);
if (
    argv.includes('--plain') ||
    argv.includes('--no-color') ||
    process.env.NO_COLOR ||
    !process.stdout.isTTY
)
    chalk.level = 0;
const wantsHelp = argv.includes('--help') || argv.includes('-h');
// The command's words come before any option: `moteur entries list --q glace`.
const words: string[] = [];
for (const a of argv) {
    if (a.startsWith('-')) break;
    words.push(a);
}

async function main(): Promise<number> {
    if (argv[0] === '--version' || argv[0] === '-v') {
        console.log(
            (createRequire(import.meta.url)('../package.json') as { version: string }).version
        );
        return 0;
    }
    if (!words.length || words[0] === 'help') {
        const [, g, n] = words;
        const named = g ? (n ? commands.find(g, n) : commands.find(g, '')) : undefined;
        if (named && n) console.log(commandHelp(named));
        else if (g && commands.inGroup(g).length) console.log(groupHelp(commands, g));
        else console.log(overviewHelp(commands));
        return 0;
    }
    const { command } = commands.resolve(words);
    const group = commands.inGroup(words[0]);
    if (!command) {
        if (group.length) {
            if (words[1]) console.error(`✗ moteur ${words[0]} has no command "${words[1]}".\n`);
            console.log(groupHelp(commands, words[0]));
            return words[1] ? 2 : 0;
        }
        console.error(`✗ Unknown command: ${words[0]}. See: moteur help`);
        return 2;
    }
    if (wantsHelp) {
        console.log(
            command.name === '' && group.length > 1
                ? groupHelp(commands, words[0])
                : commandHelp(command)
        );
        return 0;
    }
    // Everything after the command's own words: positionals and options.
    const consumed = command.name ? 2 : 1;
    return runCommand(command, argv.slice(consumed));
}

process.exitCode = await main();
