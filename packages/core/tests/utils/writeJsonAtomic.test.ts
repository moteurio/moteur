import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { writeJsonAtomicAsync } from '../../src/utils/fileUtils.js';

describe('writeJsonAtomicAsync', () => {
    let dir: string;
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-atomic-'));
    });
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    it('never leaves a corrupt file when writes to the same file overlap', async () => {
        const file = path.join(dir, 'comments.json');
        // Payloads of very different sizes: with a shared temp file, a short write landing on a
        // long one leaves trailing bytes behind.
        await Promise.all(
            Array.from({ length: 40 }, (_, i) =>
                writeJsonAtomicAsync(
                    file,
                    Array.from({ length: (i % 7) * 50 }, (_, j) => ({ i, j }))
                )
            )
        );
        expect(() => JSON.parse(fs.readFileSync(file, 'utf-8'))).not.toThrow();
        expect(fs.readdirSync(dir).filter(f => f.endsWith('.tmp'))).toEqual([]);
    });
});
