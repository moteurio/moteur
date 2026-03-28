/* global console, process */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const packagesDir = path.join(root, 'packages');

function calVerUtc(d = new Date()) {
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    return `${y}.${m}.${day}`;
}

function resolveVersion() {
    const override = process.env.RELEASE_VERSION?.trim();
    if (override) return override;
    return calVerUtc();
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, obj) {
    const text = `${JSON.stringify(obj, null, 4)}\n`;
    fs.writeFileSync(filePath, text, 'utf8');
}

const version = resolveVersion();
const packageDirs = fs
    .readdirSync(packagesDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => path.join(packagesDir, d.name))
    .filter(dir => fs.existsSync(path.join(dir, 'package.json')));

let updated = 0;
for (const dir of packageDirs) {
    const filePath = path.join(dir, 'package.json');
    const pkg = readJson(filePath);
    if (typeof pkg.name !== 'string' || !pkg.name.startsWith('@moteurio/')) continue;
    if (pkg.version === version) continue;
    pkg.version = version;
    writeJson(filePath, pkg);
    updated += 1;
    console.error(`set-release-version-from-date: ${pkg.name} -> ${version}`);
}

if (updated === 0) {
    console.error('set-release-version-from-date: all @moteurio/* packages already at release line');
}

console.log(version);
