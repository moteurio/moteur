/**
 * Test, build, pnpm pack (resolves workspace:* to registry versions), then npm stage publish.
 * Usage: node scripts/stage-publish.mjs @moteurio/types
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const filter = process.argv[2];
if (!filter?.startsWith('@moteurio/')) {
    console.error('Usage: node scripts/stage-publish.mjs @moteurio/<package>');
    process.exit(1);
}

const root = path.resolve(import.meta.dirname, '..');
const packDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-pack-'));

function run(cmd, args, opts = {}) {
    execFileSync(cmd, args, { cwd: root, stdio: 'inherit', ...opts });
}

run('pnpm', ['--filter', filter, 'test']);
run('pnpm', ['--filter', filter, 'run', 'build']);
const packLog = execFileSync('pnpm', ['--filter', filter, 'pack', '--pack-destination', packDir], {
    cwd: root,
    encoding: 'utf8'
});
const tgz = packLog
    .trim()
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.endsWith('.tgz'))
    .pop();
if (!tgz || !fs.existsSync(tgz)) {
    console.error('stage-publish: could not find pack output');
    process.exit(1);
}
console.error(`stage-publish: ${filter} from ${path.basename(tgz)}`);
run('npm', ['stage', 'publish', tgz, '--access', 'public']);
