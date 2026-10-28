import fs from 'fs';
import fsp from 'fs/promises';

/**
 * Small files read again and again (project.json, schemas, pages, the secrets file), kept as
 * text and served while the file is unchanged. A file is unchanged while its inode, size and
 * times are: Moteur writes by replacing the file (a new inode) and every other writer (Git, a
 * restore, a person) changes its times. Two writes can land in one tick of the file system's
 * clock, so, as Git does with its index, a file changed in the last few seconds isn't kept: it's
 * read from disk until it's older, and any later change moves its time past what was kept. One
 * stat replaces an open, a read and a close, and the text is parsed by each caller, so no one
 * shares an object.
 */

const MAX_FILES = 20_000;
const MAX_BYTES = 64 * 1024 * 1024;

type Cached = { signature: string; text: string };
const files = new Map<string, Cached>();
let bytes = 0;

/** Changed this recently, a file's times may not tell its next change apart. */
const SETTLED_MS = 2000;

const signatureOf = (st: fs.Stats) => `${st.ino}:${st.size}:${st.mtimeMs}:${st.ctimeMs}`;
const settled = (st: fs.Stats) => Date.now() - st.mtimeMs > SETTLED_MS;

function remember(file: string, signature: string, text: string, st: fs.Stats): string {
    const old = files.get(file);
    if (old) {
        bytes -= old.text.length;
        files.delete(file);
    }
    // Large files aren't worth keeping: they're read rarely and would push the rest out.
    if (text.length > 1024 * 1024 || !settled(st)) return text;
    files.set(file, { signature, text });
    bytes += text.length;
    // Oldest first (a Map keeps insertion order; a hit moves the file to the end).
    for (const [key, entry] of files) {
        if (files.size <= MAX_FILES && bytes <= MAX_BYTES) break;
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

/** A file's text, from memory while it is unchanged. Throws like `readFile` (ENOENT…). */
export async function readTextCached(file: string): Promise<string> {
    const st = await fsp.stat(file);
    const signature = signatureOf(st);
    return hit(file, signature) ?? remember(file, signature, await fsp.readFile(file, 'utf-8'), st);
}

/** `readTextCached` for the code that reads synchronously (schemas loaded at startup and after). */
export function readTextCachedSync(file: string): string {
    const st = fs.statSync(file);
    const signature = signatureOf(st);
    return hit(file, signature) ?? remember(file, signature, fs.readFileSync(file, 'utf-8'), st);
}

/** Forget everything (tests that rewrite files within one clock tick). */
export function clearFileCache(): void {
    files.clear();
    bytes = 0;
}
