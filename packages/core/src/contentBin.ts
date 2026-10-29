import fs from 'fs';
import path from 'path';
import type { Entry } from '@moteurio/types/Model.js';
import type { PageNode } from '@moteurio/types/Page.js';
import type { User } from '@moteurio/types/User.js';
import { writeFileAtomicSync } from './utils/fileUtils.js';
import { isValidId } from './utils/idUtils.js';
import { trashEntryDir, trashModelDir, trashPagesDir, trashProjectDir } from './utils/pathUtils.js';

/**
 * The bin for entries and pages: what someone deleted waits here, outside the project's
 * repository, with who deleted it and when, until it is taken out (back as a draft) or an admin
 * deletes it for good. Each deletion is its own file, so deleting the same id twice keeps both.
 *
 * Bin ids name what they hold: `entry.<modelId>.<entryId>.<ms>` and `page.<pageId>.<ms>`.
 */

/** Who put it in the bin, and when. */
export type Binned = { at: string; by?: string; byName?: string };

export type BinItem =
    | { id: string; kind: 'entry'; modelId: string; binned: Binned; entry: Entry }
    | { id: string; kind: 'page'; binned: Binned; page: PageNode };

type Where =
    | { kind: 'entry'; modelId: string; itemId: string; ms: number }
    | { kind: 'page'; itemId: string; ms: number };

/** Not in the bin (or never was): the API answers 404. */
function notInBin(): Error {
    return Object.assign(new Error('Nothing in the bin has this id.'), { statusCode: 404 });
}

function fileOf(projectId: string, where: Where): string {
    const name = `${where.itemId}-${where.ms}.json`;
    return where.kind === 'entry'
        ? path.join(trashEntryDir(projectId, where.modelId, where.itemId), name)
        : path.join(trashPagesDir(projectId), name);
}

function idOf(where: Where): string {
    return where.kind === 'entry'
        ? `entry.${where.modelId}.${where.itemId}.${where.ms}`
        : `page.${where.itemId}.${where.ms}`;
}

function parse(binId: string): Where {
    const parts = String(binId).split('.');
    const ms = Number(parts.at(-1));
    const ids = parts.slice(1, -1);
    if (!Number.isSafeInteger(ms) || ms < 0 || !ids.every(isValidId)) throw notInBin();
    if (parts[0] === 'entry' && ids.length === 2)
        return { kind: 'entry', modelId: ids[0], itemId: ids[1], ms };
    if (parts[0] === 'page' && ids.length === 1) return { kind: 'page', itemId: ids[0], ms };
    throw notInBin();
}

function stamp(user: User): Binned {
    return { at: new Date().toISOString(), by: user.id, byName: user.name ?? undefined };
}

/** Keeps a deleted entry in the bin. Its file in the project is the caller's to remove. */
export function binEntry(
    projectId: string,
    modelId: string,
    entryId: string,
    entry: Entry,
    user: User
): void {
    const file = fileOf(projectId, { kind: 'entry', modelId, itemId: entryId, ms: Date.now() });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    writeFileAtomicSync(file, JSON.stringify({ binned: stamp(user), item: entry }, null, 2));
}

/** Keeps a deleted page in the bin. Its file in the project is the caller's to remove. */
export function binPage(projectId: string, page: PageNode, user: User): void {
    const file = fileOf(projectId, { kind: 'page', itemId: page.id, ms: Date.now() });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    writeFileAtomicSync(file, JSON.stringify({ binned: stamp(user), item: page }, null, 2));
}

function read(projectId: string, where: Where): BinItem | null {
    let stored: { binned?: Binned; item?: unknown };
    try {
        stored = JSON.parse(fs.readFileSync(fileOf(projectId, where), 'utf-8'));
    } catch {
        return null;
    }
    if (!stored?.binned?.at || !stored.item || typeof stored.item !== 'object') return null;
    const id = idOf(where);
    return where.kind === 'entry'
        ? {
              id,
              kind: 'entry',
              modelId: where.modelId,
              binned: stored.binned,
              entry: stored.item as Entry
          }
        : { id, kind: 'page', binned: stored.binned, page: stored.item as PageNode };
}

/** One thing in the bin; throws (404) when there is none with this id. */
export function getBinItem(projectId: string, binId: string): BinItem {
    const item = read(projectId, parse(binId));
    if (!item) throw notInBin();
    return item;
}

/** Bin files in `dir` named `<id>-<ms>.json`. */
function namedIn(dir: string): { itemId: string; ms: number }[] {
    let names: string[];
    try {
        names = fs.readdirSync(dir);
    } catch {
        return [];
    }
    return names.flatMap(name => {
        const m = /^([\w-]+)-(\d+)\.json$/.exec(name);
        return m ? [{ itemId: m[1], ms: Number(m[2]) }] : [];
    });
}

function subdirs(dir: string): string[] {
    try {
        return fs
            .readdirSync(dir, { withFileTypes: true })
            .filter(d => d.isDirectory() && isValidId(d.name))
            .map(d => d.name);
    } catch {
        return [];
    }
}

/** Everything in a project's bin, most recently deleted first. */
export function listBinItems(projectId: string): BinItem[] {
    const found: Where[] = [];
    for (const modelId of subdirs(path.join(trashProjectDir(projectId), 'models'))) {
        const entries = path.join(trashModelDir(projectId, modelId), 'entries');
        for (const entryId of subdirs(entries)) {
            for (const f of namedIn(path.join(entries, entryId)))
                if (f.itemId === entryId) found.push({ kind: 'entry', modelId, ...f });
        }
    }
    for (const f of namedIn(trashPagesDir(projectId))) found.push({ kind: 'page', ...f });
    return found
        .flatMap(where => read(projectId, where) ?? [])
        .sort((a, b) => b.binned.at.localeCompare(a.binned.at));
}

/** Takes it out of the bin for good (once restored, or deleted forever). */
export function removeFromBin(projectId: string, binId: string): void {
    const file = fileOf(projectId, parse(binId));
    try {
        fs.unlinkSync(file);
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw notInBin();
        throw err;
    }
}
