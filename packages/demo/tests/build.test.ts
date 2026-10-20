import { describe, expect, it } from 'vitest';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const run = promisify(execFile);
const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(PKG, '../..');

async function build(args: string[], into?: string) {
    const out = into ?? fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-demo-build-'));
    try {
        const { stdout } = await run(
            'npx',
            [
                'tsx',
                '--tsconfig',
                path.join(REPO, 'tsconfig.server-dev.json'),
                'src/cli.ts',
                ...args,
                '--out',
                out
            ],
            { cwd: PKG, maxBuffer: 1 << 24 }
        );
        return { stdout, out };
    } catch (err) {
        if (!into) fs.rmSync(out, { recursive: true, force: true });
        throw err;
    }
}

describe('demo builds', () => {
    it('builds the fixtures project with exactly the expected invalid entries', async () => {
        const { stdout, out } = await build(['fixtures']);
        try {
            expect(stdout).toMatch(/Fixtures .*: \d+ entries, 0 invalid/);
            const entries = path.join(
                out,
                'data',
                'projects',
                'fixtures',
                'models',
                'kitchen-sink',
                'entries'
            );
            expect(fs.readdirSync(entries)).toContain('all-filled');
        } finally {
            fs.rmSync(out, { recursive: true, force: true });
        }
    });

    it('builds a scale project with the requested number of entries', async () => {
        const { out } = await build(['scale', '--scale', '250']);
        try {
            const entries = path.join(
                out,
                'data',
                'projects',
                'scale',
                'models',
                'article',
                'entries'
            );
            expect(fs.readdirSync(entries)).toHaveLength(250);
        } finally {
            fs.rmSync(out, { recursive: true, force: true });
        }
    });

    it('refuses to overwrite an existing project without --force', async () => {
        const { out } = await build(['scale', '--scale', '5']);
        try {
            await expect(build(['scale', '--scale', '5'], out)).rejects.toThrow(/already exists/);
        } finally {
            fs.rmSync(out, { recursive: true, force: true });
        }
    });
});
