#!/usr/bin/env node
/**
 * Stable CLI entry for pnpm/npm shims (exists before `tsc` output).
 * Loads compiled dist; see README if dist is missing.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distMain = join(__dirname, '..', 'dist', 'index.js');

if (!existsSync(distMain)) {
    console.error(
        'Moteur CLI is not built yet. From the monorepo root run:\n' +
            '  pnpm run build\n' +
            'or:\n' +
            '  pnpm --filter @moteurio/cli build\n' +
            'For development you can also use: pnpm run cli:dev'
    );
    process.exit(1);
}

await import(pathToFileURL(distMain).href);
