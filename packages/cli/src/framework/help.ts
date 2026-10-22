import chalk from 'chalk';
import type { ArgSpec, CommandSpec, Commands } from '@moteurio/commands';
import { argsOf } from './run.js';

const title = (s: string) => chalk.bold(s);
const dim = (s: string) => chalk.dim(s);

/** `moteur help`: every group, one line each. */
export function overviewHelp(commands: Commands): string {
    const lines = [
        title('moteur') + ' — Moteur from scripts, CI and agents',
        '',
        'Usage: moteur <group> <command> [arguments] [--json]',
        ''
    ];
    const width = Math.max(...commands.groups().map(g => g.length)) + 2;
    for (const g of commands.groups()) {
        const names = commands
            .inGroup(g)
            .map(c => c.name || dim('(default)'))
            .join(', ');
        lines.push(`  ${g.padEnd(width)}${names}`);
    }
    lines.push(
        '',
        'Every command takes --json (JSON out), --quiet, --yes (no questions), --project <id>.',
        'Details: moteur <group> --help, moteur <group> <command> --help.',
        'Anything else the API does: moteur api <METHOD> <path>.',
        '',
        'For the Studio in your terminal, install @moteurio/studio-cli and run `moteur-studio`.'
    );
    return lines.join('\n');
}

/** `moteur entries --help`: the group's commands with their summaries. */
export function groupHelp(commands: Commands, group: string): string {
    const list = commands.inGroup(group);
    const width = Math.max(...list.map(c => c.name.length)) + 2;
    return [
        title(`moteur ${group}`),
        '',
        ...list.map(c => `  ${(c.name || '(default)').padEnd(width)}${c.summary}`),
        '',
        `Details: moteur ${group} <command> --help`
    ].join('\n');
}

function argLine(a: ArgSpec): string {
    const value =
        a.type === 'boolean'
            ? ''
            : a.choices
              ? ` <${a.choices.join('|')}>`
              : ` <${a.type ?? 'string'}>`;
    const flag = `--${a.name}${value}`;
    const marks = [
        a.required ? 'required' : '',
        a.default !== undefined ? `default ${String(a.default)}` : ''
    ]
        .filter(Boolean)
        .join(', ');
    return `  ${flag.padEnd(32)}${a.description}${marks ? dim(` (${marks})`) : ''}`;
}

/** `moteur entries publish --help`: what it does, its arguments, the call it makes. */
export function commandHelp(command: CommandSpec): string {
    const all = argsOf(command);
    const own = all.filter(
        a => !['json', 'quiet', 'yes', 'plain', 'debug', 'help'].includes(a.name)
    );
    const positionals = own
        .filter(a => a.positional !== undefined)
        .sort((a, b) => a.positional! - b.positional!);
    const usage = [
        'moteur',
        command.group,
        command.name,
        ...positionals.map(a => (a.required ? `<${a.name}>` : `[${a.name}]`)),
        '[options]'
    ]
        .filter(Boolean)
        .join(' ');
    const lines = [title(command.summary), ''];
    if (command.description) lines.push(command.description, '');
    lines.push(`Usage: ${usage}`, '');
    if (own.length) lines.push('Options:', ...own.map(argLine), '');
    lines.push(dim('Also: --json, --quiet, --yes, --debug'));
    if (command.http) lines.push(dim(`Calls: ${command.http}`));
    if (command.destructive) lines.push(dim('Asks first (or --yes): it can’t be undone.'));
    if (command.examples?.length)
        lines.push('', 'Examples:', ...command.examples.map(e => `  ${e}`));
    return lines.join('\n');
}
