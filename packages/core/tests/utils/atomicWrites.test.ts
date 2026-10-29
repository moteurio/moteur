import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeFileAtomicAsync, writeFileAtomicSync } from '../../src/utils/fileUtils.js';

/** A disk that fills up as the temporary file is written. */
const noSpace = () =>
    Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });

describe('writing a file whole or not at all', () => {
    let dir: string;
    let file: string;
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-atomic-'));
        file = path.join(dir, 'secrets.json');
        fs.writeFileSync(file, '{"token":"kept"}');
    });
    afterEach(() => {
        vi.restoreAllMocks();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('leaves the file as it was, and no temporary file, when the disk is full', () => {
        const write = fs.writeFileSync;
        vi.spyOn(fs, 'writeFileSync').mockImplementation((target, data, options) => {
            write(target, String(data).slice(0, 3), options as fs.WriteFileOptions);
            throw noSpace();
        });
        expect(() => writeFileAtomicSync(file, '{"token":"new"}', 0o600)).toThrow(/ENOSPC/);
        vi.restoreAllMocks();
        expect(fs.readFileSync(file, 'utf8')).toBe('{"token":"kept"}');
        expect(fs.readdirSync(dir)).toEqual(['secrets.json']);
    });

    it('the same without blocking', async () => {
        vi.spyOn(fs.promises, 'writeFile').mockRejectedValue(noSpace());
        await expect(writeFileAtomicAsync(file, '{"token":"new"}')).rejects.toThrow(/ENOSPC/);
        vi.restoreAllMocks();
        expect(fs.readFileSync(file, 'utf8')).toBe('{"token":"kept"}');
        expect(fs.readdirSync(dir)).toEqual(['secrets.json']);
    });

    it('writes it whole otherwise, with the mode asked', () => {
        writeFileAtomicSync(file, '{"token":"new"}', 0o600);
        expect(fs.readFileSync(file, 'utf8')).toBe('{"token":"new"}');
        expect(fs.statSync(file).mode & 0o777).toBe(0o600);
        expect(fs.readdirSync(dir)).toEqual(['secrets.json']);
    });
});
