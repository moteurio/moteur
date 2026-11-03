#!/usr/bin/env node
/* global console, process */
// Writes docs/CLI.md (the command reference) from the declarations (build first: pnpm build).
// Commands a host plugin serves (PLUGIN_COMMANDS) are only named there: the open docs don't
// describe private plugins. `--hosted <file>` writes every command, for a host's own docs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { commands } from '../dist/commands/index.js';
import { argsOf } from '../dist/framework/run.js';
import { pluginOf } from '@moteurio/commands';

const here = path.dirname(fileURLToPath(import.meta.url));
const hostedAt = process.argv.indexOf('--hosted');
const hosted = hostedAt !== -1;
const out = hosted
    ? path.resolve(process.cwd(), process.argv[hostedAt + 1] ?? 'CLI.md')
    : path.resolve(here, '../../../docs/CLI.md');
const shown = c => hosted || !pluginOf(c);
const GLOBAL = new Set(['json', 'quiet', 'yes', 'plain', 'debug', 'help']);
const cell = s => String(s ?? '').replace(/\|/g, '\\|');

const lines = [
    '# Moteur CLI reference',
    '',
    '<!-- Generated from packages/cli/src/commands by `pnpm --filter @moteurio/cli docs`. Edit the declarations, not this file. -->',
    '',
    '`moteur` drives a Moteur API from scripts, CI and agents. Every command takes `--json` (the API’s answer as JSON), `--quiet`, `--yes` (no questions before changes that can’t be undone), `--debug`, and `--project <id>` where it works on a project (default: `MOTEUR_PROJECT`, `.moteur.json`, or `moteur projects use <id>`). Anything without a command: `moteur api <METHOD> <path>`.',
    '',
    'Install: `npm install -g @moteurio/cli`. Sign in: `moteur auth login`. The Studio in your terminal is a separate package: `@moteurio/studio-cli` (`moteur-studio`).',
    ''
];
for (const group of commands.groups()) {
    const listed = commands.inGroup(group).filter(shown);
    if (!listed.length) continue;
    lines.push(`## ${group}`, '');
    for (const c of listed) {
        const args = argsOf(c).filter(a => !GLOBAL.has(a.name));
        const positionals = args
            .filter(a => a.positional !== undefined)
            .sort((a, b) => a.positional - b.positional);
        const usage = [
            'moteur',
            c.group,
            c.name,
            ...positionals.map(a => (a.required ? `<${a.name}>` : `[${a.name}]`))
        ]
            .filter(Boolean)
            .join(' ');
        lines.push(
            `### \`${usage}\``,
            '',
            c.summary + (c.destructive ? ' Asks first (or `--yes`).' : ''),
            ''
        );
        if (c.description) lines.push(c.description, '');
        if (args.length) {
            lines.push('| Option | |', '| --- | --- |');
            for (const a of args) {
                const value =
                    a.type === 'boolean'
                        ? ''
                        : a.choices
                          ? ` <${a.choices.join('\\|')}>`
                          : ` <${a.type ?? 'string'}>`;
                const marks = [
                    a.required ? 'required' : '',
                    a.default !== undefined ? `default \`${a.default}\`` : ''
                ]
                    .filter(Boolean)
                    .join(', ');
                lines.push(
                    `| \`--${a.name}${value}\` | ${cell(a.description)}${marks ? ` (${marks})` : ''} |`
                );
            }
            lines.push('');
        }
        if (c.http) lines.push(`Calls \`${c.http}\`.`, '');
        if (c.examples?.length) lines.push('```bash', ...c.examples, '```', '');
    }
}
const fromPlugins = commands.all().filter(c => !shown(c));
if (fromPlugins.length) {
    const byPlugin = new Map();
    for (const c of fromPlugins) {
        const name = pluginOf(c);
        byPlugin.set(name, [
            ...(byPlugin.get(name) ?? []),
            `\`moteur ${c.group} ${c.name}\``.replace(/ `$/, '`')
        ]);
    }
    lines.push(
        '## Commands for host plugins',
        '',
        'These talk to plugins a host may have (api.moteur.io has them all). They are described in that host’s docs.',
        ''
    );
    for (const [name, list] of byPlugin) lines.push(`- **${name}:** ${list.join(', ')}`);
    lines.push('');
}
fs.writeFileSync(out, lines.join('\n').replace(/\n+$/, '\n'));
// The repository's formatting, so the file doesn't change on the next commit hook.
spawnSync('pnpm', ['exec', 'prettier', '--write', out], { stdio: 'ignore' });
console.log(`Wrote ${path.relative(process.cwd(), out)} (${commands.all().length} commands).`);
