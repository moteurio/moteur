import fs from 'fs';
import path from 'path';
import type { Entry, ModelSchema } from '@moteurio/types/Model.js';
import type { PageNode } from '@moteurio/types/Page.js';
import type { User } from '@moteurio/types/User.js';
import { writeFileAtomicSync } from './utils/fileUtils.js';
import { isValidId } from './utils/idUtils.js';
import {
    trashEntryDir,
    trashModelDir,
    trashPagesDir,
    trashProjectDir,
    trashSchemasDir
} from './utils/pathUtils.js';

/**
 * The bin for entries, pages and models: what someone deleted waits here, outside the project's
 * repository, with who deleted it and when, until it is taken out (back as a draft) or an admin
 * deletes it for good. Each deletion is its own file, so deleting the same id twice keeps both.
 * A deleted model is a folder instead: the model's own, moved whole, entries and all.
 *
 * Bin ids name what they hold: `entry.<modelId>.<entryId>.<ms>`, `page.<pageId>.<ms>` and
 * `model.<modelId>.<ms>`.
 */

/** Who put it in the bin, and when. */
export type Binned = { at: string; by?: string; byName?: string };

export type BinItem =
    | { id: string; kind: 'entry'; modelId: string; binned: Binned; entry: Entry }
    | { id: string; kind: 'page'; binned: Binned; page: PageNode }
    | {
          id: string;
          kind: 'model';
          modelId: string;
          binned: Binned;
          model: ModelSchema;
          /** How many entries went with it (and come back with it). */
          entryCount: number;
      };

type Where =
    | { kind: 'entry'; modelId: string; itemId: string; ms: number }
    | { kind: 'page' | 'model'; itemId: string; ms: number };

/** A deleted model's folder in the bin: `binned.json` beside `model/`, the folder as it was. */
function modelBinDir(projectId: string, modelId: string, ms: number): string {
    return path.join(trashSchemasDir(projectId), `${modelId}-${ms}`);
}

/** Not in the bin (or never was): the API answers 404. */
function notInBin(): Error {
    return Object.assign(new Error('Nothing in the bin has this id.'), { statusCode: 404 });
}

function fileOf(projectId: string, where: Where): string {
    if (where.kind === 'model')
        return path.join(modelBinDir(projectId, where.itemId, where.ms), 'binned.json');
    const name = `${where.itemId}-${where.ms}.json`;
    return where.kind === 'entry'
        ? path.join(trashEntryDir(projectId, where.modelId, where.itemId), name)
        : path.join(trashPagesDir(projectId), name);
}

function idOf(where: Where): string {
    return where.kind === 'entry'
        ? `entry.${where.modelId}.${where.itemId}.${where.ms}`
        : `${where.kind}.${where.itemId}.${where.ms}`;
}

function parse(binId: string): Where {
    const parts = String(binId).split('.');
    const ms = Number(parts.at(-1));
    const ids = parts.slice(1, -1);
    if (!Number.isSafeInteger(ms) || ms < 0 || !ids.every(isValidId)) throw notInBin();
    if (parts[0] === 'entry' && ids.length === 2)
        return { kind: 'entry', modelId: ids[0], itemId: ids[1], ms };
    if ((parts[0] === 'page' || parts[0] === 'model') && ids.length === 1)
        return { kind: parts[0], itemId: ids[0], ms };
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

/**
 * Moves a deleted model's folder (the model and every entry in it) into the bin, with who deleted
 * it and when. The folder leaves the project only once that record is written.
 */
export function binModel(
    projectId: string,
    model: ModelSchema,
    folder: string,
    entryCount: number,
    user: User
): void {
    const dir = modelBinDir(projectId, model.id, Date.now());
    fs.mkdirSync(dir, { recursive: true });
    try {
        writeFileAtomicSync(
            path.join(dir, 'binned.json'),
            JSON.stringify({ binned: stamp(user), item: model, entryCount }, null, 2)
        );
        fs.renameSync(folder, path.join(dir, 'model'));
    } catch (err) {
        fs.rmSync(dir, { recursive: true, force: true });
        throw err;
    }
}

/**
 * Moves a deleted model's folder from the bin back to `folder` and clears its place in the bin.
 * The caller checks first that nothing is at `folder` now.
 */
export function unbinModel(projectId: string, binId: string, folder: string): void {
    const where = parse(binId);
    if (where.kind !== 'model') throw notInBin();
    const dir = modelBinDir(projectId, where.itemId, where.ms);
    fs.mkdirSync(path.dirname(folder), { recursive: true });
    fs.renameSync(path.join(dir, 'model'), folder);
    fs.rmSync(dir, { recursive: true, force: true });
}

/** Keeps a deleted page in the bin. Its file in the project is the caller's to remove. */
export function binPage(projectId: string, page: PageNode, user: User): void {
    const file = fileOf(projectId, { kind: 'page', itemId: page.id, ms: Date.now() });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    writeFileAtomicSync(file, JSON.stringify({ binned: stamp(user), item: page }, null, 2));
}

function read(projectId: string, where: Where): BinItem | null {
    let stored: { binned?: Binned; item?: unknown; entryCount?: number };
    try {
        stored = JSON.parse(fs.readFileSync(fileOf(projectId, where), 'utf-8'));
    } catch {
        return null;
    }
    if (!stored?.binned?.at || !stored.item || typeof stored.item !== 'object') return null;
    const id = idOf(where);
    if (where.kind === 'model') {
        if (!fs.existsSync(path.join(path.dirname(fileOf(projectId, where)), 'model'))) return null;
        return {
            id,
            kind: 'model',
            modelId: where.itemId,
            binned: stored.binned,
            model: stored.item as ModelSchema,
            entryCount: Number(stored.entryCount) || 0
        };
    }
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

function dirNames(dir: string): string[] {
    try {
        return fs
            .readdirSync(dir, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => d.name);
    } catch {
        return [];
    }
}

function subdirs(dir: string): string[] {
    return dirNames(dir).filter(isValidId);
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
    for (const name of dirNames(trashSchemasDir(projectId))) {
        const m = /^([\w-]+)-(\d+)$/.exec(name);
        if (m && isValidId(m[1])) found.push({ kind: 'model', itemId: m[1], ms: Number(m[2]) });
    }
    return found
        .flatMap(where => read(projectId, where) ?? [])
        .sort((a, b) => b.binned.at.localeCompare(a.binned.at));
}

/** Takes it out of the bin for good (once restored, or deleted forever). */
export function removeFromBin(projectId: string, binId: string): void {
    const where = parse(binId);
    const file = fileOf(projectId, where);
    if (where.kind === 'model') {
        if (!fs.existsSync(file)) throw notInBin();
        fs.rmSync(path.dirname(file), { recursive: true, force: true });
        return;
    }
    try {
        fs.unlinkSync(file);
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw notInBin();
        throw err;
    }
}
