#!/usr/bin/env node
/* global process, console, fetch */
// Which API operations have a command (build first: pnpm build). The CLI and the MCP server both offer these.
//   node scripts/coverage.mjs                         the engine's spec (pnpm openapi:export)
//   node scripts/coverage.mjs http://localhost:3100/openapi.json   a running API, plugins included
//   node scripts/coverage.mjs path/to/openapi.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_COMMANDS, coverage, SKIPPED, normalize, PLUGIN_GROUPS } from '../dist/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = process.argv[2] ?? path.resolve(here, '../../api/dist-openapi/openapi.json');
const doc = /^https?:/.test(source)
    ? await (await fetch(source)).json()
    : JSON.parse(fs.readFileSync(source, 'utf8'));
const c = coverage(API_COMMANDS, doc);
const skippedReasons = Object.fromEntries(
    Object.entries(SKIPPED).map(([k, v]) => [normalize(k), v])
);

console.log(
    `${c.covered.length} of ${c.total} operations have a command; ${c.skipped.length} left out on purpose.`
);
if (c.missing.length)
    console.log(
        `\nNo command yet (${c.missing.length}):\n${c.missing.map(o => `  ${o}`).join('\n')}`
    );
// Plugin routes are only in a document from an API running those plugins.
const fromPlugins = c.unknown.filter(u => PLUGIN_GROUPS[u.command.split(' ')[0]]);
const unknown = c.unknown.filter(u => !PLUGIN_GROUPS[u.command.split(' ')[0]]);
if (fromPlugins.length)
    console.log(
        `\nPlugin commands this document has no routes for (${fromPlugins.length}): ${[...new Set(fromPlugins.map(u => u.command.split(' ')[0]))].join(', ')}`
    );
if (unknown.length)
    console.log(
        `\nCommands calling routes the document doesn't list:\n${unknown.map(u => `  ${u.command}: ${u.op}`).join('\n')}`
    );
if (process.argv.includes('--skipped'))
    console.log(`\nLeft out:\n${c.skipped.map(o => `  ${o} — ${skippedReasons[o]}`).join('\n')}`);
process.exitCode = c.missing.length || unknown.length ? 1 : 0;
