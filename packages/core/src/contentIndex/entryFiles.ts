import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { performance } from 'perf_hooks';
import { setImmediate } from 'timers';
import type { Entry } from '@moteurio/types/Model.js';
import { projectDir } from '../utils/pathUtils.js';
import { entryKey } from '../utils/storageKeys.js';
import { readBlobs } from '../git/gitService.js';
import * as publishedCache from '../git/publishedContentCache.js';

export type EntryFileRef = { modelId: string; entryId: string; file: string };

async function subdirectories(dir: string): Promise<string[]> {
    try {
        const items = await fsp.readdir(dir, { withFileTypes: true });
        // Dot-directories are not content.
        return items.filter(d => d.isDirectory() && !d.name.startsWith('.')).map(d => d.name);
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw err;
    }
}

/** Every `models/{model}/entries/{id}/entry.json` path, or those of one model. */
export async function listEntryFiles(projectId: string, modelId?: string): Promise<EntryFileRef[]> {
    const modelsDir = path.join(projectDir(projectId), 'models');
    const modelIds = modelId ? [modelId] : await subdirectories(modelsDir);
    const refs: EntryFileRef[] = [];
    for (const m of modelIds) {
        const entriesDir = path.join(modelsDir, m, 'entries');
        for (const entryId of await subdirectories(entriesDir)) {
            // Plain concatenation: path.join per file is measurable with tens of thousands.
            const file = `${entriesDir}${path.sep}${entryId}${path.sep}entry.json`;
            refs.push({ modelId: m, entryId, file });
        }
    }
    return refs;
}

/** Longest stretch of synchronous file work before yielding to the event loop. */
const SLICE_MS = 10;

/**
 * Map items with a synchronous function, yielding to the event loop every SLICE_MS. Small
 * synchronous reads are several times faster than their promise versions (no thread-pool
 * round trip per file), and slicing keeps the server responsive while thousands are read.
 */
export async function mapSliced<T, R>(items: T[], fn: (item: T) => R): Promise<R[]> {
    const results = new Array<R>(items.length);
    let sliceStart = performance.now();
    for (let i = 0; i < items.length; i++) {
        results[i] = fn(items[i]);
        if (performance.now() - sliceStart > SLICE_MS) {
            await new Promise(resolve => setImmediate(resolve));
            sliceStart = performance.now();
        }
    }
    return results;
}

/** mtime and size of a file, or null when it is missing. */
export function statEntryFile(file: string): { mtimeMs: number; size: number } | null {
    try {
        const s = fs.statSync(file);
        return { mtimeMs: s.mtimeMs, size: s.size };
    } catch {
        return null;
    }
}

/** Parse an entry file, or null when it is missing or not valid JSON. */
export function readEntryFile(file: string): Entry | null {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf-8')) as Entry;
    } catch {
        return null;
    }
}

/**
 * Read the published snapshots of many entries from git in one batch, using the in-memory
 * cache first. Returns a map from `${commit}:${entryKey}` to the parsed snapshot; snapshots
 * that can't be read are absent.
 */
export async function readPublishedSnapshots(
    projectId: string,
    wanted: Array<{ modelId: string; entryId: string; commit: string }>
): Promise<Map<string, Entry>> {
    const found = new Map<string, Entry>();
    const missing: string[] = [];
    for (const w of wanted) {
        const key = entryKey(w.modelId, w.entryId);
        const spec = `${w.commit}:${key}`;
        const cached = publishedCache.get(w.commit, key);
        if (cached !== undefined) {
            try {
                found.set(spec, JSON.parse(cached) as Entry);
                continue;
            } catch {
                /* re-read from git */
            }
        }
        missing.push(spec);
    }
    if (missing.length > 0) {
        const blobs = await readBlobs(projectDir(projectId), missing);
        for (const [spec, raw] of blobs) {
            if (raw == null) continue;
            try {
                found.set(spec, JSON.parse(raw) as Entry);
                const sep = spec.indexOf(':');
                publishedCache.set(spec.slice(0, sep), spec.slice(sep + 1), raw);
            } catch {
                /* corrupt snapshot: the entry file is served instead */
            }
        }
    }
    return found;
}
