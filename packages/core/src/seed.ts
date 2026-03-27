import fs from 'fs';
import path from 'path';
import { storageConfig } from './config/storageConfig.js';
import type { BlueprintKind } from '@moteurio/types/Blueprint.js';

const BLUEPRINT_KINDS: BlueprintKind[] = ['project', 'model', 'structure', 'template'];

export interface SeedOptions {
    /** If true, overwrite existing blueprint files. Default: false (only copy when missing). */
    force?: boolean;
    /** Source directory for seed blueprints. Default: dataRoot/data/seeds/blueprints */
    seedsDir?: string;
}

/**
 * Copy blueprint seed files from data/seeds/blueprints/<kind>/ into data/blueprints/<kind>/.
 * By default only copies when the destination file does not exist; use force: true to overwrite.
 * Creates kind subdirs under blueprintsDir as needed.
 */
export function runSeed(options: SeedOptions = {}): { copied: string[]; skipped: string[] } {
    const { force = false } = options;
    const dataRoot = storageConfig.dataRoot;
    const seedsDir = options.seedsDir ?? path.join(dataRoot, 'data', 'seeds', 'blueprints');
    const blueprintsDir = storageConfig.blueprintsDir;

    if (!fs.existsSync(seedsDir)) {
        throw new Error(
            `Seeds directory not found: ${seedsDir}. Run from the moteur repo or set SEEDS_DIR.`
        );
    }

    const copied: string[] = [];
    const skipped: string[] = [];

    for (const kind of BLUEPRINT_KINDS) {
        const kindSeeds = path.join(seedsDir, kind);
        if (!fs.existsSync(kindSeeds)) continue;

        const kindDest = path.join(blueprintsDir, kind);
        fs.mkdirSync(kindDest, { recursive: true });

        const files = fs.readdirSync(kindSeeds).filter(f => f.endsWith('.json'));
        for (const file of files) {
            const src = path.join(kindSeeds, file);
            const dest = path.join(kindDest, file);
            if (!force && fs.existsSync(dest)) {
                skipped.push(`${kind}/${file}`);
                continue;
            }
            fs.copyFileSync(src, dest);
            copied.push(`${kind}/${file}`);
        }
    }

    return { copied, skipped };
}
