/* global console, process */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const packagesDir = path.join(root, 'packages');
const targetDeps = new Set([
    '@moteurio/types',
    '@moteurio/plugin-sdk',
    '@moteurio/core',
    '@moteurio/ai',
    '@moteurio/presence',
    '@moteurio/api',
    '@moteurio/client'
]);
const expectedLine = process.env.EXPECTED_MOTEUR_LINE ?? '2026.3.27';

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const packageDirs = fs
    .readdirSync(packagesDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => path.join(packagesDir, d.name))
    .filter(dir => fs.existsSync(path.join(dir, 'package.json')));

const violations = [];
for (const dir of packageDirs) {
    const filePath = path.join(dir, 'package.json');
    const pkg = readJson(filePath);

    if (pkg.private !== true && typeof pkg.name === 'string' && pkg.name.startsWith('@moteurio/')) {
        if (pkg.version !== expectedLine) {
            violations.push(
                `${pkg.name}: package version "${pkg.version}" must match release line "${expectedLine}"`
            );
        }
    }

    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    for (const [depName, depVersion] of Object.entries(deps)) {
        if (!targetDeps.has(depName)) continue;
        if (depVersion === 'workspace:*') continue;
        if (typeof depVersion !== 'string' || depVersion !== `^${expectedLine}`) {
            violations.push(`${pkg.name}: invalid ${depName} range "${depVersion}"`);
        }
    }
}

if (violations.length > 0) {
    console.error('Release line policy check failed:\n');
    for (const v of violations) console.error(`- ${v}`);
    process.exit(1);
}

console.log('Release line policy check passed.');
