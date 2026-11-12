import fs from 'fs';
import fsp from 'fs/promises';
import { cacheShare } from './cacheBudget.js';

/**
 * Caches the text of small files that are read repeatedly (project.json, schemas, pages, the
 * secrets file) and serves it while the file is unchanged. A file counts as unchanged while its
 * inode, size and timestamps are the same. Moteur writes by replacing the file, which gives it a
 * new inode, and every other writer (Git, a restore, a user) changes its timestamps.
 *
 * Two writes can land within one tick of the file system clock. To avoid serving stale text, and
 * as Git does with its index, a file modified in the last few seconds is not cached and is read
 * from disk until it is older. Any later change then moves its timestamp past the cached one.
 *
 * Checking a file costs one stat instead of an open, a read and a close. The cache holds text, not
 * parsed objects, so each caller parses its own copy and no callers share a mutable object.
 */

const MAX_FILES = 20_000;
const maxBytes = () => cacheShare('files');

type Cached = { signature: string; text: string };
const files = new Map<string, Cached>();
let bytes = 0;

/** A file modified this recently (in ms) is not cached, because its timestamps may not reveal its next change. */
const SETTLED_MS = 2000;

const signatureOf = (st: fs.Stats) => `${st.ino}:${st.size}:${st.mtimeMs}:${st.ctimeMs}`;
const settled = (st: fs.Stats) => Date.now() - st.mtimeMs > SETTLED_MS;

function remember(file: string, signature: string, text: string, st: fs.Stats): string {
    const old = files.get(file);
    if (old) {
        bytes -= old.text.length;
        files.delete(file);
    }
    // Don't cache large files. They are read rarely and would push out many smaller files.
    if (text.length > 1024 * 1024 || !settled(st)) return text;
    files.set(file, { signature, text });
    bytes += text.length;
    // Evict the oldest entries first. A Map keeps insertion order, and a cache hit moves the file to the end.
    for (const [key, entry] of files) {
        if (files.size <= MAX_FILES && bytes <= maxBytes()) break;
        files.delete(key);
        bytes -= entry.text.length;
    }
    return text;
}

function hit(file: string, signature: string): string | undefined {
    const found = files.get(file);
    if (!found || found.signature !== signature) return undefined;
    files.delete(file);
    files.set(file, found);
    return found.text;
}

/** Returns a file's text from memory while the file is unchanged. Throws like `readFile` does (for example ENOENT). */
export async function readTextCached(file: string): Promise<string> {
    const st = await fsp.stat(file);
    const signature = signatureOf(st);
    return hit(file, signature) ?? remember(file, signature, await fsp.readFile(file, 'utf-8'), st);
}

/** Synchronous version of `readTextCached`, for code that must read synchronously, such as schema loading. */
export function readTextCachedSync(file: string): string {
    const st = fs.statSync(file);
    const signature = signatureOf(st);
    return hit(file, signature) ?? remember(file, signature, fs.readFileSync(file, 'utf-8'), st);
}

/** Clears the cache. Tests use this when they rewrite files within one clock tick. */
export function clearFileCache(): void {
    files.clear();
    bytes = 0;
}
