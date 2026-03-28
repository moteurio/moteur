/* global console, process, fetch, AbortSignal */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const packagesDir = path.join(root, 'packages');

/** First published package in orchestrator order; used as npm sentinel for the shared release line. */
const NPM_VERSION_SENTINEL = '@moteurio/types';
const MAX_SAME_DAY_SUFFIX = 50;

function calVerUtc(d = new Date()) {
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    return `${y}.${m}.${day}`;
}

function skipNpmProbe() {
    const v = process.env.SKIP_NPM_VERSION_PROBE?.trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
}

async function npmVersionExists(pkgName, version) {
    const url = `https://registry.npmjs.org/${encodeURIComponent(pkgName)}`;
    const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(25_000)
    });
    if (res.status === 404) return false;
    if (!res.ok) {
        throw new Error(`npm registry HTTP ${res.status} for ${pkgName}`);
    }
    const data = await res.json();
    return Boolean(data.versions?.[version]);
}

/**
 * Picks the first `base`, `base-2`, `base-3`, … not yet published for the sentinel package.
 */
async function resolveVersionAfterNpm(base) {
    if (skipNpmProbe()) {
        console.error('set-release-version-from-date: SKIP_NPM_VERSION_PROBE set; using calendar base only');
        return base;
    }
    if (!(await npmVersionExists(NPM_VERSION_SENTINEL, base))) {
        console.error(`set-release-version-from-date: ${base} not on npm (sentinel ${NPM_VERSION_SENTINEL})`);
        return base;
    }
    for (let n = 2; n <= MAX_SAME_DAY_SUFFIX; n++) {
        const candidate = `${base}-${n}`;
        if (!(await npmVersionExists(NPM_VERSION_SENTINEL, candidate))) {
            console.error(
                `set-release-version-from-date: ${base} taken on npm; using same-day line ${candidate}`
            );
            return candidate;
        }
    }
    throw new Error(
        `set-release-version-from-date: no free version up to ${base}-${MAX_SAME_DAY_SUFFIX} on npm`
    );
}

async function resolveVersion() {
    const override = process.env.RELEASE_VERSION?.trim();
    if (override) {
        console.error('set-release-version-from-date: using RELEASE_VERSION override');
        return override;
    }
    const base = calVerUtc();
    try {
        return await resolveVersionAfterNpm(base);
    } catch (e) {
        console.error(`set-release-version-from-date: npm probe failed: ${e.message}`);
        throw e;
    }
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, obj) {
    const text = `${JSON.stringify(obj, null, 4)}\n`;
    fs.writeFileSync(filePath, text, 'utf8');
}

const version = await resolveVersion();
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
