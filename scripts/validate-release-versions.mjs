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
const expectedLine = process.env.EXPECTED_MOTEUR_LINE ?? '0.1.0';

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
    console.error('Release semver policy check failed:\n');
    for (const v of violations) console.error(`- ${v}`);
    process.exit(1);
}

console.log('Release semver policy check passed.');
