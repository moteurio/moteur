import fs from 'fs';
import path from 'path';
import type { DatabaseSync, StatementSync, SQLInputValue } from 'node:sqlite';
import type { Entry } from '@moteurio/types/Model.js';
import { projectDir, workspaceDir } from '../utils/pathUtils.js';
import { entryKey } from '../utils/storageKeys.js';
import {
    listEntryFiles,
    mapSliced,
    readEntryFile,
    readPublishedSnapshots,
    statEntryFile
} from './entryFiles.js';
import { entryStatus, publishedSnapshotCommit, sortValue } from './publishedView.js';
import { fold, listFacts, project, searchTerms, type ListFacts } from './listQuery.js';
import type {
    ContentIndex,
    EntryQuery,
    EntryQueryResult,
    EntrySortField,
    ReindexStats
} from './types.js';
import { usesListFeatures } from './types.js';

type DatabaseConstructor = typeof DatabaseSync;

/** Bump when the table layout changes: an index with another version is rebuilt from scratch. */
const SCHEMA_VERSION = '3';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS entries (
    model_id TEXT NOT NULL,
    id TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    published_at TEXT NOT NULL,
    json TEXT NOT NULL,
    -- the public version: same as the entry unless it has edits made after publishing
    pub_status TEXT NOT NULL,
    pub_created_at TEXT NOT NULL,
    pub_updated_at TEXT NOT NULL,
    pub_published_at TEXT NOT NULL,
    pub_json TEXT,
    pub_commit TEXT,
    file_mtime REAL NOT NULL,
    file_size INTEGER NOT NULL,
    -- folded id and short texts of the latest version, for search
    search TEXT NOT NULL,
    UNIQUE (model_id, id)
);
-- list facts of the latest version (see listQuery.ts): field and virtual-key values, and the
-- languages that have text in each localized field
CREATE TABLE IF NOT EXISTS entry_values (
    model_id TEXT NOT NULL,
    entry_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS entry_values_lookup ON entry_values (model_id, key, value, entry_id);
CREATE INDEX IF NOT EXISTS entry_values_entry ON entry_values (model_id, entry_id, key, value);
CREATE TABLE IF NOT EXISTS entry_locales (
    model_id TEXT NOT NULL,
    entry_id TEXT NOT NULL,
    field TEXT NOT NULL,
    locale TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS entry_locales_lookup ON entry_locales (model_id, field, locale, entry_id);
CREATE INDEX IF NOT EXISTS entry_locales_entry ON entry_locales (model_id, entry_id, field, locale);
CREATE INDEX IF NOT EXISTS entries_status ON entries (model_id, status, id);
CREATE INDEX IF NOT EXISTS entries_created ON entries (model_id, created_at, id);
CREATE INDEX IF NOT EXISTS entries_updated ON entries (model_id, updated_at, id);
CREATE INDEX IF NOT EXISTS entries_published ON entries (model_id, published_at, id);
CREATE INDEX IF NOT EXISTS entries_status_updated ON entries (model_id, status, updated_at, id);
CREATE INDEX IF NOT EXISTS entries_pub_status ON entries (model_id, pub_status, id);
CREATE INDEX IF NOT EXISTS entries_pub_created ON entries (model_id, pub_status, pub_created_at, id);
CREATE INDEX IF NOT EXISTS entries_pub_updated ON entries (model_id, pub_status, pub_updated_at, id);
CREATE INDEX IF NOT EXISTS entries_pub_published ON entries (model_id, pub_status, pub_published_at, id);
`;

const SORT_COLUMNS: Record<EntrySortField, [latest: string, published: string]> = {
    id: ['id', 'id'],
    createdAt: ['created_at', 'pub_created_at'],
    updatedAt: ['updated_at', 'pub_updated_at'],
    publishedAt: ['published_at', 'pub_published_at']
};

type Row = {
    model_id: string;
    id: string;
    status: string;
    created_at: string;
    updated_at: string;
    published_at: string;
    json: string;
    pub_status: string;
    pub_created_at: string;
    pub_updated_at: string;
    pub_published_at: string;
    pub_json: string | null;
    pub_commit: string | null;
    file_mtime: number;
    file_size: number;
    search: string;
};

type FileStamp = { mtimeMs: number; size: number };

type ProjectIndex = {
    dir: string;
    dbFile: string;
    inode: number;
    db: DatabaseSync;
    upsert: StatementSync;
    getRow: StatementSync;
    clearValues: StatementSync;
    clearLocales: StatementSync;
    addValue: StatementSync;
    addLocale: StatementSync;
    /** Serializes writes and re-checks for one project. */
    tail: Promise<unknown>;
    checked: boolean;
    dirty: boolean;
    lastCheck: number;
    background: Promise<unknown> | null;
    /** Snapshots recorded by publishEntry, consumed by the following write. */
    snapshots: Map<string, string>;
};

function rowFor(
    modelId: string,
    entryId: string,
    entry: Entry,
    published: { entry: Entry; json: string; commit: string } | null,
    stamp: FileStamp,
    facts: ListFacts
): Row {
    const pub = published?.entry ?? entry;
    return {
        model_id: modelId,
        id: entryId,
        status: entryStatus(entry),
        created_at: sortValue(entry, 'createdAt'),
        updated_at: sortValue(entry, 'updatedAt'),
        published_at: sortValue(entry, 'publishedAt'),
        json: JSON.stringify(entry),
        pub_status: entryStatus(pub),
        pub_created_at: sortValue(pub, 'createdAt'),
        pub_updated_at: sortValue(pub, 'updatedAt'),
        pub_published_at: sortValue(pub, 'publishedAt'),
        pub_json: published?.json ?? null,
        pub_commit: published?.commit ?? null,
        file_mtime: stamp.mtimeMs,
        file_size: stamp.size,
        search: facts.search
    };
}

/** Replace an entry's row and its list facts. Call inside serialize (and a transaction for many). */
function writeEntry(
    p: ProjectIndex,
    modelId: string,
    entryId: string,
    entry: Entry,
    published: { entry: Entry; json: string; commit: string } | null,
    stamp: FileStamp
): void {
    const facts = listFacts(entry);
    p.upsert.run(rowFor(modelId, entryId, entry, published, stamp, facts));
    p.clearValues.run(modelId, entryId);
    p.clearLocales.run(modelId, entryId);
    for (const [key, value] of facts.values) p.addValue.run(modelId, entryId, key, value);
    for (const [field, locale] of facts.locales) p.addLocale.run(modelId, entryId, field, locale);
}

const PLACEHOLDERS = (n: number) => Array.from({ length: n }, () => '?').join(', ');

/** A JSON path to a top-level data field (and a locale), passed as a parameter, never spliced. */
const dataPath = (key: string, locale?: string) =>
    `$.data.${JSON.stringify(key)}${locale ? `.${JSON.stringify(locale)}` : ''}`;

/**
 * One SQLite database per project at `.moteur/cache/content-index.sqlite`, holding a copy of
 * every entry plus its public version. Entry files stay the source of truth: the database is
 * gitignored, excluded from workspace snapshots, and rebuilt from the files when missing,
 * outdated or corrupt.
 *
 * Writes made through core update the index immediately. Changes made outside the server
 * (git pull, hand edits) are picked up by comparing file mtimes and sizes: on first use, after
 * invalidate(), and in the background every `recheckMs`.
 */
export class SqliteIndex implements ContentIndex {
    readonly kind = 'sqlite';
    private readonly projects = new Map<string, ProjectIndex>();

    constructor(
        private readonly Database: DatabaseConstructor,
        private readonly recheckMs: number
    ) {}

    // -- queries ------------------------------------------------------------

    async queryEntries(
        projectId: string,
        modelId: string,
        query: EntryQuery
    ): Promise<EntryQueryResult> {
        const p = await this.fresh(projectId);
        if (!p) return { items: [], total: 0 };

        const published = query.view === 'published';
        if (published && usesListFeatures(query)) {
            throw new Error('Search, filters, groups and counts only work on the latest view');
        }
        if (query.status?.length === 0) return { items: [], total: 0 };

        // Conditions as SQL fragments with their parameters, so counts can leave one out.
        type Cond = { sql: string; params: SQLInputValue[]; filter?: string; missing?: true };
        const conds: Cond[] = [{ sql: 'model_id = ?', params: [modelId] }];
        if (query.status) {
            conds.push({
                sql: `${published ? 'pub_status' : 'status'} IN (${PLACEHOLDERS(query.status.length)})`,
                params: [...query.status]
            });
        }
        for (const term of searchTerms(query.search)) {
            conds.push({
                sql: 'instr(search, ?) > 0',
                params: [term]
            });
        }
        for (const [key, values] of Object.entries(query.filters ?? {})) {
            if (values.length === 0) continue;
            conds.push({
                sql: `EXISTS (SELECT 1 FROM entry_values v WHERE v.model_id = entries.model_id
                      AND v.entry_id = entries.id AND v.key = ? AND v.value IN (${PLACEHOLDERS(values.length)}))`,
                params: [key, ...values],
                filter: key
            });
        }
        if (query.missing && query.missing.locales.length > 0) {
            const { field, locales } = query.missing;
            conds.push({
                sql: `(SELECT count(DISTINCT l.locale) FROM entry_locales l WHERE l.model_id = entries.model_id
                      AND l.entry_id = entries.id AND l.field = ? AND l.locale IN (${PLACEHOLDERS(locales.length)})) < ?`,
                params: [field, ...locales, locales.length],
                missing: true
            });
        }
        const whereOf = (keep: (c: Cond) => boolean) => {
            const kept = conds.filter(keep);
            return { sql: kept.map(c => c.sql).join(' AND '), params: kept.flatMap(c => c.params) };
        };
        const where = whereOf(() => true);

        // Order: group rank, then the sort, then id.
        const orderParts: string[] = [];
        const orderParams: SQLInputValue[] = [];
        if (query.group) {
            const { key, order = [] } = query.group;
            const ranks = order.map((_, i) => `WHEN ? THEN ${i}`).join(' ');
            const rank = order.length ? `CASE v.value ${ranks} ELSE ${order.length} END` : '0';
            orderParts.push(
                `coalesce((SELECT min(${rank}) FROM entry_values v WHERE v.model_id = entries.model_id
                  AND v.entry_id = entries.id AND v.key = ?), ${order.length + 1})`,
                `(SELECT min(v.value) FROM entry_values v WHERE v.model_id = entries.model_id
                  AND v.entry_id = entries.id AND v.key = ?
                  ${order.length ? `AND v.value NOT IN (${PLACEHOLDERS(order.length)})` : ''})`
            );
            orderParams.push(...order, key, key, ...order);
        }
        const sort = query.sort ?? { field: 'id', direction: 'asc' };
        const dir = sort.direction === 'desc' ? 'DESC' : 'ASC';
        if (sort.field === 'data') {
            const text = `moteur_fold(CASE json_type(json, ?) WHEN 'object' THEN coalesce(
                nullif(trim(json_extract(json, ?)), ''),
                (SELECT j.value FROM json_each(entries.json, ?) j WHERE j.type = 'text' AND trim(j.value) <> '' LIMIT 1))
              WHEN 'text' THEN json_extract(json, ?) WHEN 'integer' THEN json_extract(json, ?)
              WHEN 'real' THEN json_extract(json, ?) ELSE '' END)`;
            const path = dataPath(sort.key);
            const localePath = sort.locale ? dataPath(sort.key, sort.locale) : '$.__none__';
            // Empty values last whatever the direction.
            orderParts.push(`(${text}) = ''`, `${text} ${dir}`, `id ${dir}`);
            const textParams = [path, localePath, path, path, path, path];
            orderParams.push(...textParams, ...textParams);
        } else {
            const column = SORT_COLUMNS[sort.field][published ? 1 : 0];
            if (sort.field !== 'id') orderParts.push(`${column} ${dir}`);
            orderParts.push(`id ${dir}`);
        }

        const limit = query.limit ?? -1;
        const offset = query.offset ?? 0;
        const rows = (
            limit === 0
                ? []
                : p.db
                      .prepare(
                          `SELECT ${published ? 'coalesce(pub_json, json)' : 'json'} AS json FROM entries
                           WHERE ${where.sql} ORDER BY ${orderParts.join(', ')} LIMIT ? OFFSET ?`
                      )
                      .all(...where.params, ...orderParams, limit, offset)
        ) as Array<{ json: string }>;
        const items = rows.map(r => project(JSON.parse(r.json) as Entry, query.fields));
        const count = (w: { sql: string; params: SQLInputValue[] }) =>
            Number(
                (
                    p.db
                        .prepare(`SELECT count(*) AS n FROM entries WHERE ${w.sql}`)
                        .get(...w.params) as { n: number }
                ).n
            );
        const total = query.limit == null && offset === 0 ? items.length : count(where);
        const result: EntryQueryResult = { items, total };

        if (query.facets?.length) {
            result.facets = {};
            for (const key of query.facets) {
                const w = whereOf(c => c.filter !== key);
                const rows = p.db
                    .prepare(
                        `SELECT v.value AS value, count(DISTINCT v.entry_id) AS n FROM entry_values v
                         WHERE v.model_id = ? AND v.key = ? AND v.entry_id IN
                           (SELECT id FROM entries WHERE ${w.sql})
                         GROUP BY v.value`
                    )
                    .all(modelId, key, ...w.params) as Array<{ value: string; n: number }>;
                result.facets[key] = Object.fromEntries(rows.map(r => [r.value, Number(r.n)]));
            }
        }
        if (query.missingCounts) {
            const { field, locales } = query.missingCounts;
            const w = whereOf(c => !c.missing);
            result.missingCounts = Object.fromEntries(
                locales.map(locale => [
                    locale,
                    count({
                        sql: `${w.sql} AND NOT EXISTS (SELECT 1 FROM entry_locales l
                              WHERE l.model_id = entries.model_id AND l.entry_id = entries.id
                              AND l.field = ? AND l.locale = ?)`,
                        params: [...w.params, field, locale]
                    })
                ])
            );
        }
        return result;
    }

    async getPublishedSnapshot(
        projectId: string,
        modelId: string,
        entryId: string,
        commit: string
    ): Promise<Entry | undefined> {
        const p = this.open(projectId);
        if (!p) return undefined;
        const row = p.getRow.get(modelId, entryId) as Row | undefined;
        if (row?.pub_commit !== commit || row.pub_json == null) return undefined;
        return JSON.parse(row.pub_json) as Entry;
    }

    // -- writes -------------------------------------------------------------

    async entryWritten(
        projectId: string,
        modelId: string,
        entryId: string,
        entry: Entry
    ): Promise<void> {
        const p = this.open(projectId, { create: true });
        if (!p) return;
        await this.serialize(p, async () => {
            const file = path.join(p.dir, entryKey(modelId, entryId));
            const stat = statEntryFile(file);
            if (!stat) return; // removed meanwhile; the next re-check drops the row
            const [published] = await this.publishedVersions(p, projectId, [
                { modelId, entryId, entry }
            ]);
            writeEntry(p, modelId, entryId, entry, published, stat);
        });
    }

    async entryRemoved(projectId: string, modelId: string, entryId: string): Promise<void> {
        const p = this.open(projectId);
        if (!p) return;
        await this.serialize(p, async () => {
            p.db.prepare('DELETE FROM entries WHERE model_id = ? AND id = ?').run(modelId, entryId);
            p.clearValues.run(modelId, entryId);
            p.clearLocales.run(modelId, entryId);
        });
    }

    async modelRemoved(projectId: string, modelId: string): Promise<void> {
        const p = this.open(projectId);
        if (!p) return;
        await this.serialize(p, async () => {
            for (const table of ['entries', 'entry_values', 'entry_locales']) {
                p.db.prepare(`DELETE FROM ${table} WHERE model_id = ?`).run(modelId);
            }
        });
    }

    publishedSnapshotTaken(
        projectId: string,
        modelId: string,
        entryId: string,
        commit: string,
        snapshot: Entry
    ): void {
        const p = this.open(projectId, { create: true });
        p?.snapshots.set(`${commit}:${entryKey(modelId, entryId)}`, JSON.stringify(snapshot));
    }

    invalidate(projectId: string): void {
        const p = this.projects.get(projectDir(projectId));
        if (p) p.dirty = true;
    }

    async reindex(projectId: string, options?: { full?: boolean }): Promise<ReindexStats> {
        const p = this.open(projectId, { create: true });
        if (!p) return { scanned: 0, updated: 0, removed: 0, durationMs: 0 };
        return this.serialize(p, () => this.reconcile(p, projectId, options?.full ?? false));
    }

    close(projectId?: string): void {
        const dirs = projectId ? [projectDir(projectId)] : [...this.projects.keys()];
        for (const dir of dirs) {
            const p = this.projects.get(dir);
            if (!p) continue;
            this.projects.delete(dir);
            try {
                p.db.close();
            } catch {
                /* already closed */
            }
        }
    }

    // -- internals ----------------------------------------------------------

    /** Open the project's index, re-checking files first when needed. */
    private async fresh(projectId: string): Promise<ProjectIndex | null> {
        const p = this.open(projectId, { create: true });
        if (!p) return null;
        if (!p.checked || p.dirty) {
            await this.serialize(p, async () => {
                if (!p.checked || p.dirty) await this.reconcile(p, projectId, false);
            });
        } else if (
            this.recheckMs > 0 &&
            !p.background &&
            Date.now() - p.lastCheck > this.recheckMs
        ) {
            p.background = this.serialize(p, () => this.reconcile(p, projectId, false))
                .catch(err =>
                    console.warn(
                        `[Moteur] Content index re-check failed for project "${projectId}":`,
                        err instanceof Error ? err.message : err
                    )
                )
                .finally(() => {
                    p.background = null;
                });
        }
        return p;
    }

    /**
     * The open index for a project, or null when the project directory doesn't exist. Reopens
     * when the database file was deleted or replaced underneath (project deleted and re-created).
     */
    private open(projectId: string, options?: { create?: boolean }): ProjectIndex | null {
        const dir = projectDir(projectId);
        const existing = this.projects.get(dir);
        const dbFile = path.join(workspaceDir(projectId), 'cache', 'content-index.sqlite');
        if (existing) {
            let inode = -1;
            try {
                inode = fs.statSync(dbFile).ino;
            } catch {
                /* deleted */
            }
            if (inode === existing.inode) return existing;
            this.close(projectId);
        }
        if (!options?.create || !fs.existsSync(dir)) return null;
        fs.mkdirSync(path.dirname(dbFile), { recursive: true });
        let db: DatabaseSync;
        try {
            db = this.connect(dbFile);
        } catch (err) {
            // Corrupt or unreadable: the index is only a cache, start over.
            console.warn(
                `[Moteur] Rebuilding content index for project "${projectId}":`,
                err instanceof Error ? err.message : err
            );
            for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbFile + suffix, { force: true });
            db = this.connect(dbFile);
        }
        const columns = Object.keys(
            rowFor(
                '',
                '',
                { id: '' } as Entry,
                null,
                { mtimeMs: 0, size: 0 },
                listFacts({
                    id: ''
                } as Entry)
            )
        );
        const p: ProjectIndex = {
            dir,
            dbFile,
            inode: fs.statSync(dbFile).ino,
            db,
            upsert: db.prepare(
                `INSERT INTO entries (${columns.join(', ')})
                 VALUES (${columns.map(c => `$${c}`).join(', ')})
                 ON CONFLICT (model_id, id) DO UPDATE SET
                 ${columns
                     .filter(c => c !== 'model_id' && c !== 'id')
                     .map(c => `${c} = excluded.${c}`)
                     .join(', ')}`
            ),
            getRow: db.prepare('SELECT * FROM entries WHERE model_id = ? AND id = ?'),
            clearValues: db.prepare('DELETE FROM entry_values WHERE model_id = ? AND entry_id = ?'),
            clearLocales: db.prepare(
                'DELETE FROM entry_locales WHERE model_id = ? AND entry_id = ?'
            ),
            addValue: db.prepare(
                'INSERT INTO entry_values (model_id, entry_id, key, value) VALUES (?, ?, ?, ?)'
            ),
            addLocale: db.prepare(
                'INSERT INTO entry_locales (model_id, entry_id, field, locale) VALUES (?, ?, ?, ?)'
            ),
            tail: Promise.resolve(),
            checked: false,
            dirty: false,
            lastCheck: 0,
            background: null,
            snapshots: new Map()
        };
        this.projects.set(dir, p);
        return p;
    }

    private connect(dbFile: string): DatabaseSync {
        const db = new this.Database(dbFile);
        try {
            db.exec(
                'PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;'
            );
            const version = (() => {
                try {
                    const row = db.prepare("SELECT value FROM meta WHERE key = 'schema'").get() as
                        { value: string } | undefined;
                    return row?.value;
                } catch {
                    return undefined;
                }
            })();
            // Text sorts and search ignore case and accents the same way as listQuery.ts.
            db.function('moteur_fold', { deterministic: true }, (v: unknown) => fold(v));
            if (version !== SCHEMA_VERSION) {
                db.exec(
                    'DROP TABLE IF EXISTS entries; DROP TABLE IF EXISTS entry_values; ' +
                        'DROP TABLE IF EXISTS entry_locales; DROP TABLE IF EXISTS meta;'
                );
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

    private serialize<T>(p: ProjectIndex, fn: () => Promise<T>): Promise<T> {
        const run = p.tail.then(fn, fn);
        p.tail = run.catch(() => {});
        return run;
    }

    /**
     * The public version of each entry when it differs from the entry itself: from the index
     * row when it already holds that commit's snapshot, from publishEntry, or from git.
     */
    private async publishedVersions(
        p: ProjectIndex,
        projectId: string,
        items: Array<{ modelId: string; entryId: string; entry: Entry }>
    ): Promise<Array<{ entry: Entry; json: string; commit: string } | null>> {
        const result: Array<{ entry: Entry; json: string; commit: string } | null> = items.map(
            () => null
        );
        const fromGit: Array<{ index: number; modelId: string; entryId: string; commit: string }> =
            [];
        items.forEach(({ modelId, entryId, entry }, index) => {
            const commit = publishedSnapshotCommit(entry);
            if (!commit) return;
            const spec = `${commit}:${entryKey(modelId, entryId)}`;
            const taken = p.snapshots.get(spec);
            if (taken) {
                p.snapshots.delete(spec);
                result[index] = { entry: JSON.parse(taken) as Entry, json: taken, commit };
                return;
            }
            const row = p.getRow.get(modelId, entryId) as Row | undefined;
            if (row?.pub_commit === commit && row.pub_json != null) {
                result[index] = {
                    entry: JSON.parse(row.pub_json) as Entry,
                    json: row.pub_json,
                    commit
                };
                return;
            }
            fromGit.push({ index, modelId, entryId, commit });
        });
        if (fromGit.length > 0) {
            const snapshots = await readPublishedSnapshots(projectId, fromGit);
            for (const w of fromGit) {
                const snapshot = snapshots.get(`${w.commit}:${entryKey(w.modelId, w.entryId)}`);
                // An unreadable snapshot serves the entry file, like the git-only code path.
                if (snapshot) {
                    result[w.index] = {
                        entry: snapshot,
                        json: JSON.stringify(snapshot),
                        commit: w.commit
                    };
                }
            }
        }
        return result;
    }

    /** Compare every entry file with the index and update what changed. */
    private async reconcile(
        p: ProjectIndex,
        projectId: string,
        full: boolean
    ): Promise<ReindexStats> {
        const started = Date.now();
        const known = new Map<string, FileStamp>();
        for (const row of p.db
            .prepare('SELECT model_id, id, file_mtime, file_size FROM entries')
            .all() as Array<Pick<Row, 'model_id' | 'id' | 'file_mtime' | 'file_size'>>) {
            known.set(`${row.model_id}/${row.id}`, {
                mtimeMs: row.file_mtime,
                size: row.file_size
            });
        }

        const refs = await listEntryFiles(projectId);
        const stamps = await mapSliced(refs, r => statEntryFile(r.file));
        const present = new Set<string>();
        const changed: Array<{ modelId: string; entryId: string; file: string; stamp: FileStamp }> =
            [];
        refs.forEach((ref, i) => {
            const stamp = stamps[i];
            if (!stamp) return;
            const key = `${ref.modelId}/${ref.entryId}`;
            present.add(key);
            const prev = known.get(key);
            if (full || !prev || prev.mtimeMs !== stamp.mtimeMs || prev.size !== stamp.size) {
                changed.push({ ...ref, stamp });
            }
        });

        const parsed = await mapSliced(changed, c => readEntryFile(c.file));
        const readable: Array<{
            modelId: string;
            entryId: string;
            entry: Entry;
            stamp: FileStamp;
        }> = [];
        changed.forEach((c, i) => {
            const entry = parsed[i];
            if (!entry) {
                present.delete(`${c.modelId}/${c.entryId}`);
                return;
            }
            readable.push({ modelId: c.modelId, entryId: c.entryId, entry, stamp: c.stamp });
        });
        const published = await this.publishedVersions(p, projectId, readable);

        const removed = [...known.keys()].filter(key => !present.has(key));
        const remove = p.db.prepare('DELETE FROM entries WHERE model_id = ? AND id = ?');
        p.db.exec('BEGIN');
        try {
            readable.forEach((r, i) =>
                writeEntry(p, r.modelId, r.entryId, r.entry, published[i], r.stamp)
            );
            for (const key of removed) {
                const slash = key.indexOf('/');
                const [modelId, entryId] = [key.slice(0, slash), key.slice(slash + 1)];
                remove.run(modelId, entryId);
                p.clearValues.run(modelId, entryId);
                p.clearLocales.run(modelId, entryId);
            }
            p.db.exec('COMMIT');
        } catch (err) {
            p.db.exec('ROLLBACK');
            throw err;
        }

        p.checked = true;
        p.dirty = false;
        p.lastCheck = Date.now();
        return {
            scanned: refs.length,
            updated: readable.length,
            removed: removed.length,
            durationMs: Date.now() - started
        };
    }
}
