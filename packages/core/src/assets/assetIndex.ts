/**
 * The asset index: fast library pages on top of `assets.json`.
 *
 * `assets.json` (tracked by git) stays the source of truth. The index is a rebuildable SQLite
 * copy at `.moteur/cache/assets.sqlite` that supports paging, filtering, search and counts
 * without reading the whole file on every request. It follows MOTEUR_CONTENT_INDEX like the
 * content index: `sqlite` (default) or `files` (no index: every request reads the file).
 *
 * It keeps itself in sync: before answering a query, it checks the file's inode, size and
 * modification time. When the file changed (a save through the API, a git pull, a manual edit),
 * it reads the file once and updates the rows that differ. Deleting the database is always safe.
 */
import fs from 'fs';
import path from 'path';
import type { DatabaseSync, StatementSync, SQLInputValue } from 'node:sqlite';
import type { Asset } from '@moteurio/types/Asset.js';
import { projectDir, stateDir } from '../utils/pathUtils.js';
import { ASSETS_KEY } from '../utils/storageKeys.js';
import { busy, closeWhenIdle, INDEX_PRAGMAS } from '../utils/idleIndexes.js';
import { ASSET_KINDS, fold, kindOf, searchText } from './assetFacts.js';

/** Increase this when the table layout changes. An index with a different version is rebuilt. */
const SCHEMA_VERSION = '1';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    kind TEXT NOT NULL,
    folder TEXT NOT NULL,
    binned INTEGER NOT NULL,
    hash TEXT,
    search TEXT NOT NULL,
    json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS assets_newest ON assets (binned, created_at DESC, id);
CREATE INDEX IF NOT EXISTS assets_kind ON assets (binned, kind, created_at DESC, id);
CREATE INDEX IF NOT EXISTS assets_folder ON assets (binned, folder, created_at DESC, id);
CREATE INDEX IF NOT EXISTS assets_hash ON assets (hash);
`;

export type AssetIndexQuery = {
    /** A file kind, or `unused` (in which case `used` must be given). */
    kind?: string;
    /** Use `''` for files that are in no folder. */
    folder?: string;
    search?: string;
    /** Ids of assets that content references, used for the `unused` filter and its count. */
    used?: Set<string>;
    limit: number;
    offset: number;
    facets?: boolean;
};

export type AssetIndexPage = {
    /** The asset as stored in assets.json, with URLs not yet resolved to absolute addresses. */
    assets: Asset[];
    total: number;
    facets?: { total: number; kinds: Record<string, number>; folders: string[] };
};

export interface AssetIndex {
    page(projectId: string, query: AssetIndexQuery): Promise<AssetIndexPage>;
    /** Every asset with this content hash, including those in the bin. */
    byHash(projectId: string, hash: string): Promise<Asset[]>;
    close(): void;
}

type Open = {
    dbFile: string;
    inode: number;
    db: DatabaseSync;
    upsert: StatementSync;
    remove: StatementSync;
    /** Serializes syncs for one project. */
    tail: Promise<unknown>;
    /** When the index was last used and what is queued on it. Idle indexes are closed (see idleIndexes.ts). */
    used: number;
    pending: number;
};

/** Identifies the file's version. A save writes a temporary file and renames it, which always changes the inode. */
function stampOf(file: string): string {
    try {
        const s = fs.statSync(file);
        return `${s.ino}:${s.size}:${s.mtimeMs}`;
    } catch {
        return 'none';
    }
}

/** Builds a LIKE pattern that matches `words` anywhere, escaping LIKE's own special characters. */
const contains = (words: string) => `%${words.replace(/[\\%_]/g, c => `\\${c}`)}%`;

class SqliteAssetIndex implements AssetIndex {
    private readonly projects = new Map<string, Open>();
    constructor(private readonly Database: typeof DatabaseSync) {
        closeWhenIdle(this.projects, dir => {
            const p = this.projects.get(dir);
            this.projects.delete(dir);
            try {
                p?.db.close();
            } catch {
                /* already closed */
            }
        });
    }

    async page(projectId: string, q: AssetIndexQuery): Promise<AssetIndexPage> {
        const p = await this.ready(projectId);
        if (!p) return { assets: [], total: 0 };
        const used = JSON.stringify([...(q.used ?? [])]);
        const where = ['binned = 0'];
        const args: SQLInputValue[] = [];
        if (q.kind === 'unused') {
            where.push('id NOT IN (SELECT value FROM json_each(?))');
            args.push(used);
        } else if (q.kind) {
            where.push('kind = ?');
            args.push(q.kind);
        }
        if (q.folder != null) {
            where.push('folder = ?');
            args.push(q.folder);
        }
        const words = fold(q.search?.trim() ?? '');
        if (words) {
            where.push("search LIKE ? ESCAPE '\\'");
            args.push(contains(words));
        }
        const clause = where.join(' AND ');
        const total = (
            p.db.prepare(`SELECT count(*) AS n FROM assets WHERE ${clause}`).get(...args) as {
                n: number;
            }
        ).n;
        const rows = p.db
            .prepare(
                `SELECT json FROM assets WHERE ${clause}
                 ORDER BY created_at DESC, id ASC LIMIT ? OFFSET ?`
            )
            .all(...args, q.limit, q.offset) as { json: string }[];

        let facets: AssetIndexPage['facets'];
        if (q.facets) {
            const kinds: Record<string, number> = Object.fromEntries(
                [...ASSET_KINDS, 'unused'].map(k => [k, 0])
            );
            for (const r of p.db
                .prepare('SELECT kind, count(*) AS n FROM assets WHERE binned = 0 GROUP BY kind')
                .all() as { kind: string; n: number }[])
                kinds[r.kind] = r.n;
            kinds.unused = (
                p.db
                    .prepare(
                        'SELECT count(*) AS n FROM assets WHERE binned = 0 AND id NOT IN (SELECT value FROM json_each(?))'
                    )
                    .get(used) as { n: number }
            ).n;
            const folders = (
                p.db
                    .prepare(
                        "SELECT DISTINCT folder FROM assets WHERE binned = 0 AND folder <> '' ORDER BY folder"
                    )
                    .all() as { folder: string }[]
            ).map(r => r.folder);
            const all = (
                p.db.prepare('SELECT count(*) AS n FROM assets WHERE binned = 0').get() as {
                    n: number;
                }
            ).n;
            facets = { total: all, kinds, folders };
        }
        return {
            assets: rows.map(r => JSON.parse(r.json) as Asset),
            total,
            ...(facets && { facets })
        };
    }

    async byHash(projectId: string, hash: string): Promise<Asset[]> {
        const p = await this.ready(projectId);
        if (!p) return [];
        return (
            p.db.prepare('SELECT json FROM assets WHERE hash = ?').all(hash) as { json: string }[]
        ).map(r => JSON.parse(r.json) as Asset);
    }

    close(): void {
        for (const p of this.projects.values()) p.db.close();
        this.projects.clear();
    }

    /** Returns the project's index after syncing it with assets.json. */
    private async ready(projectId: string): Promise<Open | null> {
        const p = this.open(projectId);
        if (!p) return null;
        const run = busy(
            p,
            p.tail.then(() => this.sync(projectId, p))
        );
        p.tail = run.catch(() => undefined);
        await run;
        p.used = Date.now();
        return p;
    }

    private sync(projectId: string, p: Open): void {
        const file = path.join(projectDir(projectId), ASSETS_KEY);
        const stamp = stampOf(file);
        const known = p.db.prepare("SELECT value FROM meta WHERE key = 'stamp'").get() as
            { value: string } | undefined;
        if (known?.value === stamp) return;

        let list: Asset[] = [];
        try {
            const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (Array.isArray(parsed)) list = parsed;
        } catch {
            // The file is missing or half-written: treat the library as empty until it parses.
        }
        const stored = new Map(
            (
                p.db.prepare('SELECT id, json FROM assets').all() as { id: string; json: string }[]
            ).map(r => [r.id, r.json])
        );
        p.db.exec('BEGIN');
        try {
            const seen = new Set<string>();
            for (const asset of list) {
                if (!asset?.id || seen.has(asset.id)) continue;
                seen.add(asset.id);
                const json = JSON.stringify(asset);
                if (stored.get(asset.id) === json) continue;
                p.upsert.run({
                    $id: asset.id,
                    $created_at: asset.createdAt ?? '',
                    $kind: kindOf(asset),
                    $folder: asset.folder ?? '',
                    $binned: asset.deletedAt ? 1 : 0,
                    $hash: asset.hash ?? null,
                    $search: searchText(asset),
                    $json: json
                });
            }
            for (const id of stored.keys()) if (!seen.has(id)) p.remove.run(id);
            p.db
                .prepare(
                    "INSERT INTO meta (key, value) VALUES ('stamp', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value"
                )
                .run(stamp);
            p.db.exec('COMMIT');
        } catch (err) {
            p.db.exec('ROLLBACK');
            throw err;
        }
    }

    /** Opens a project's database, reopening it if the file was deleted while open. */
    private open(projectId: string): Open | null {
        const dir = projectDir(projectId);
        if (!fs.existsSync(dir)) return null;
        const dbFile = path.join(stateDir(projectId), 'cache', 'assets.sqlite');
        const existing = this.projects.get(dir);
        if (existing) {
            let inode = -1;
            try {
                inode = fs.statSync(dbFile).ino;
            } catch {
                /* deleted */
            }
            if (inode === existing.inode) {
                existing.used = Date.now();
                return existing;
            }
            existing.db.close();
            this.projects.delete(dir);
        }
        fs.mkdirSync(path.dirname(dbFile), { recursive: true });
        let db: DatabaseSync;
        try {
            db = this.connect(dbFile);
        } catch (err) {
            // The database is corrupt or unreadable. It is only a cache, so rebuild it from
            // assets.json.
            console.warn(
                `[Moteur] Rebuilding the asset index of project "${projectId}":`,
                err instanceof Error ? err.message : err
            );
            for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbFile + suffix, { force: true });
            db = this.connect(dbFile);
        }
        const p: Open = {
            dbFile,
            inode: fs.statSync(dbFile).ino,
            db,
            upsert: db.prepare(
                `INSERT INTO assets (id, created_at, kind, folder, binned, hash, search, json)
                 VALUES ($id, $created_at, $kind, $folder, $binned, $hash, $search, $json)
                 ON CONFLICT (id) DO UPDATE SET created_at = excluded.created_at,
                 kind = excluded.kind, folder = excluded.folder, binned = excluded.binned,
                 hash = excluded.hash, search = excluded.search, json = excluded.json`
            ),
            remove: db.prepare('DELETE FROM assets WHERE id = ?'),
            tail: Promise.resolve(),
            used: Date.now(),
            pending: 0
        };
        this.projects.set(dir, p);
        return p;
    }

    private connect(dbFile: string): DatabaseSync {
        const db = new this.Database(dbFile);
        try {
            db.exec(
                'PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;' +
                    INDEX_PRAGMAS
            );
            let version: string | undefined;
            try {
                version = (
                    db.prepare("SELECT value FROM meta WHERE key = 'schema'").get() as
                        { value: string } | undefined
                )?.value;
            } catch {
                version = undefined;
            }
            if (version !== SCHEMA_VERSION) {
                db.exec('DROP TABLE IF EXISTS assets; DROP TABLE IF EXISTS meta;');
                db.exec(SCHEMA);
                db.prepare("INSERT INTO meta (key, value) VALUES ('schema', ?)").run(
                    SCHEMA_VERSION
                );
            }
            return db;
        } catch (err) {
            db.close();
            throw err;
        }
    }
}

let current: Promise<AssetIndex | null> | null = null;

async function create(): Promise<AssetIndex | null> {
    const kind = (process.env.MOTEUR_CONTENT_INDEX ?? 'sqlite').trim().toLowerCase();
    if (kind !== 'sqlite') return null;
    try {
        const { DatabaseSync } = await import('node:sqlite');
        return new SqliteAssetIndex(DatabaseSync);
    } catch (err) {
        console.warn(
            '[Moteur] SQLite asset index unavailable (needs Node.js 22.13+), paging the library from assets.json:',
            err instanceof Error ? err.message : err
        );
        return null;
    }
}

/** Returns the asset index, or null when assets.json should be read directly (MOTEUR_CONTENT_INDEX=files). */
export function getAssetIndex(): Promise<AssetIndex | null> {
    current ??= create();
    return current;
}

/** Closes the index and chooses the adapter again from the environment (for tests). */
export async function resetAssetIndex(): Promise<void> {
    if (current) (await current)?.close();
    current = null;
}
