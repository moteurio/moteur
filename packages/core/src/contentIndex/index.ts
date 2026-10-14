/**
 * Content index: fast entry listing on top of the file store.
 *
 * Entry files (tracked by git) are the source of truth. The index is a rebuildable copy used
 * for listing, filtering, sorting and paging, and to serve published versions without
 * running git on the request path.
 *
 * MOTEUR_CONTENT_INDEX selects the adapter:
 * - `sqlite` (default): one database per project under `.moteur/cache/`. Uses the built-in
 *   `node:sqlite` module; falls back to `files` with a warning when it is unavailable.
 * - `files`: no index, every query reads every entry file.
 * MOTEUR_CONTENT_INDEX_RECHECK_MS (default 30000, 0 to disable): how often the sqlite index
 * re-checks files in the background for changes made outside the server.
 */
import { FileScanIndex } from './fileScanIndex.js';
import type { ContentIndex } from './types.js';

export type {
    ContentIndex,
    EntryQuery,
    EntryQueryResult,
    EntrySortField,
    EntryView,
    ReindexStats
} from './types.js';
export { ENTRY_SORT_FIELDS } from './types.js';
export { publishedSnapshotCommit } from './publishedView.js';

const DEFAULT_RECHECK_MS = 30_000;

let current: Promise<ContentIndex> | null = null;

async function create(): Promise<ContentIndex> {
    const kind = (process.env.MOTEUR_CONTENT_INDEX ?? 'sqlite').trim().toLowerCase();
    if (kind === 'files') return new FileScanIndex();
    if (kind !== 'sqlite') {
        console.warn(`[Moteur] Unknown MOTEUR_CONTENT_INDEX "${kind}", using "files".`);
        return new FileScanIndex();
    }
    try {
        const { DatabaseSync } = await import('node:sqlite');
        const { SqliteIndex } = await import('./sqliteIndex.js');
        const raw = Number(process.env.MOTEUR_CONTENT_INDEX_RECHECK_MS);
        const recheckMs = Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_RECHECK_MS;
        return new SqliteIndex(DatabaseSync, recheckMs);
    } catch (err) {
        console.warn(
            '[Moteur] SQLite content index unavailable (needs Node.js 22.13+), listing entries from files:',
            err instanceof Error ? err.message : err
        );
        return new FileScanIndex();
    }
}

/** The configured content index (created on first use). */
export function getContentIndex(): Promise<ContentIndex> {
    current ??= create();
    return current;
}

/** Close the current index and pick the adapter again from the environment (tests). */
export async function resetContentIndex(): Promise<void> {
    if (current) (await current).close();
    current = null;
}

const ENTRY_KEY = /^models\/([^/]+)\/entries\/([^/]+)\/entry\.json$/;

/** Model and entry ids when a storage key is an entry file, else null. */
export function parseEntryKey(key: string): { modelId: string; entryId: string } | null {
    const m = ENTRY_KEY.exec(key.replace(/\\/g, '/'));
    return m ? { modelId: m[1], entryId: m[2] } : null;
}
