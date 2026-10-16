/**
 * Build Moteur's demo projects into a data root.
 *
 *   pnpm demo:build                     build the Journal into ./data (refuses to overwrite)
 *   pnpm demo:build all --force         Journal + fixtures, setting existing ones aside
 *   pnpm demo:build scale --scale 10000 bulk project for performance work
 *
 * Options:
 *   --out <dir>             data root to build into (contains data/); default: repo root
 *   --force                 move existing projects to data/projects/.trash/ first
 *   --password <pw>         let the demo users sign in (default: MOTEUR_DEMO_PASSWORD; none = no sign-in)
 *   --asset-base-url <url>  base URL baked into media URLs (default: STATIC_ASSETS_BASE_URL or http://localhost:3000)
 *   --scale <n>             entries for the scale project (default 10000)
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { boot, ensureCoreDefinitions } from './runtime/boot.js';
import { installClock, uninstallClock } from './runtime/clock.js';
import { setAside, type ValidationReport } from './runtime/project.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const TARGETS = ['journal', 'fixtures', 'scale', 'all'] as const;
type Target = (typeof TARGETS)[number];

function parseArgs(argv: string[]) {
    const opts = {
        targets: [] as Target[],
        out: REPO_ROOT,
        force: false,
        password: process.env.MOTEUR_DEMO_PASSWORD as string | undefined,
        assetBaseUrl: process.env.STATIC_ASSETS_BASE_URL ?? 'http://localhost:3000',
        scale: 10000
    };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--out') opts.out = path.resolve(argv[++i]);
        else if (a === '--force') opts.force = true;
        else if (a === '--password') opts.password = argv[++i];
        else if (a === '--asset-base-url') opts.assetBaseUrl = argv[++i];
        else if (a === '--scale') opts.scale = Number(argv[++i]);
        else if ((TARGETS as readonly string[]).includes(a)) opts.targets.push(a as Target);
        else throw new Error(`Unknown argument "${a}". Targets: ${TARGETS.join(', ')}.`);
    }
    if (opts.targets.length === 0) opts.targets.push('journal');
    if (opts.targets.includes('all')) opts.targets = ['journal', 'fixtures'];
    return opts;
}

function report(name: string, r: ValidationReport, strict: boolean): boolean {
    console.log(`${name}: ${r.entries} entries, ${r.invalid} invalid`);
    if (r.invalid === 0) return true;
    for (const e of r.errors.slice(0, 25))
        console.log(`  ✗ ${e.model}/${e.entry} ${e.path}: ${e.message}`);
    if (r.errors.length > 25) console.log(`  … ${r.errors.length - 25} more`);
    return !strict;
}

/** Core warns on every commit when a project has no git remote; demo projects never do. */
function quietCoreNoise(): void {
    const warn = console.warn.bind(console);
    const log = console.log.bind(console);
    console.warn = (...args: unknown[]) => {
        if (typeof args[0] === 'string' && args[0].includes('Git push skipped')) return;
        warn(...args);
    };
    console.log = (...args: unknown[]) => {
        if (typeof args[0] === 'string' && args[0].startsWith('Loading blocks for project')) return;
        log(...args);
    };
}

async function main(): Promise<number> {
    quietCoreNoise();
    const opts = parseArgs(process.argv.slice(2));
    await boot({ dataRoot: opts.out, assetBaseUrl: opts.assetBaseUrl });
    ensureCoreDefinitions(opts.out, REPO_ROOT);
    const projectIds: Record<Exclude<Target, 'all'>, string> = {
        journal: 'demo',
        fixtures: 'fixtures',
        scale: 'scale'
    };
    for (const target of opts.targets) {
        const id = projectIds[target as Exclude<Target, 'all'>];
        const exists = path.join(opts.out, 'data', 'projects', id);
        const { existsSync } = await import('fs');
        if (existsSync(exists)) {
            if (!opts.force) {
                console.error(
                    `Project "${id}" already exists in ${opts.out}/data/projects. Use --force to set it aside.`
                );
                return 1;
            }
            console.log(`Set aside existing "${id}" → ${setAside(opts.out, id)}`);
        }
    }
    if (!opts.password) {
        console.log(
            'No --password / MOTEUR_DEMO_PASSWORD: demo users are created without sign-in.'
        );
    }

    installClock();
    let ok = true;
    try {
        for (const target of opts.targets) {
            const started = Date.now();
            const log = (line: string) => console.log(`[${target}] ${line}`);
            if (target === 'journal') {
                const { buildJournal } = await import('./journal/build.js');
                ok =
                    report(
                        'Moteur Journal',
                        await buildJournal({ password: opts.password, log }),
                        true
                    ) && ok;
            } else if (target === 'fixtures') {
                const { buildFixtures } = await import('./fixtures/build.js');
                ok =
                    report(
                        'Fixtures (invalid entries are intentional)',
                        await buildFixtures({ password: opts.password, log }),
                        false
                    ) && ok;
            } else if (target === 'scale') {
                const { buildScale } = await import('./scale/build.js');
                await buildScale({ count: opts.scale, log });
            }
            uninstallClock();
            console.log(`[${target}] done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
            installClock();
        }
    } finally {
        uninstallClock();
    }
    return ok ? 0 : 1;
}

main().then(
    code => process.exit(code),
    err => {
        console.error(err instanceof Error ? (err.stack ?? err.message) : err);
        process.exit(1);
    }
);
