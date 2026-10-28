import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readTextCached, readTextCachedSync } from '../../src/utils/fileCache.js';

describe('the file cache', () => {
    let dir: string;
    let file: string;
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-file-cache-'));
        file = path.join(dir, 'page.json');
    });
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    it('sees a file replaced as Moteur writes (a new file renamed over it)', async () => {
        fs.writeFileSync(file, '{"v":1}');
        expect(await readTextCached(file)).toBe('{"v":1}');
        fs.writeFileSync(`${file}.tmp`, '{"v":2}');
        fs.renameSync(`${file}.tmp`, file);
        expect(await readTextCached(file)).toBe('{"v":2}');
    });

    it('sees a file rewritten in place, even at the same size', async () => {
        fs.writeFileSync(file, '{"v":1}');
        expect(readTextCachedSync(file)).toBe('{"v":1}');
        fs.writeFileSync(file, '{"v":3}');
        expect(readTextCachedSync(file)).toBe('{"v":3}');
        expect(await readTextCached(file)).toBe('{"v":3}');
    });

    it('says a removed file is gone', async () => {
        fs.writeFileSync(file, '{}');
        await readTextCached(file);
        fs.unlinkSync(file);
        await expect(readTextCached(file)).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('hands out text, so what one caller changes no one else sees', async () => {
        fs.writeFileSync(file, '{"title":"A"}');
        const first = JSON.parse(await readTextCached(file));
        first.title = 'changed by a caller';
        expect(JSON.parse(await readTextCached(file)).title).toBe('A');
    });

    it('keeps a settled file, and still sees it change', async () => {
        fs.writeFileSync(file, '{"v":1}');
        const old = new Date(Date.now() - 60_000);
        fs.utimesSync(file, old, old);
        expect(await readTextCached(file)).toBe('{"v":1}');
        // Kept: a read of the same file doesn't go to the disk for its text.
        const read = fs.readFileSync;
        let reads = 0;
        (fs as { readFileSync: typeof read }).readFileSync = ((...a: Parameters<typeof read>) => {
            reads++;
            return read(...a);
        }) as typeof read;
        try {
            expect(readTextCachedSync(file)).toBe('{"v":1}');
            expect(reads).toBe(0);
        } finally {
            (fs as { readFileSync: typeof read }).readFileSync = read;
        }
        // Rewritten in place at the same size: its new time gives it away.
        fs.writeFileSync(file, '{"v":2}');
        expect(await readTextCached(file)).toBe('{"v":2}');
    });
});
