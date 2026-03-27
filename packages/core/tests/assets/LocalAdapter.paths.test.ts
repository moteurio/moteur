import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalAdapter } from '../../src/assets/adapters/LocalAdapter.js';

describe('LocalAdapter path safety', () => {
    let prevDataRoot: string | undefined;
    let tmpRoot: string;

    beforeEach(() => {
        prevDataRoot = process.env.DATA_ROOT;
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-localadapter-'));
        process.env.DATA_ROOT = tmpRoot;
    });

    afterEach(() => {
        if (prevDataRoot === undefined) delete process.env.DATA_ROOT;
        else process.env.DATA_ROOT = prevDataRoot;
        try {
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        } catch {
            // ignore
        }
    });

    it('rejects traversal in variant key', async () => {
        const adapter = new LocalAdapter({ baseUrl: 'http://localhost' });
        await expect(
            adapter.upload('p1', 'x.bin', Buffer.from('a'), 'application/octet-stream', '..')
        ).rejects.toThrow(/variantKey/);
    });

    it('includes API_BASE_PATH in public URLs when set', async () => {
        const prev = process.env.API_BASE_PATH;
        process.env.API_BASE_PATH = '/api';
        try {
            const adapter = new LocalAdapter({ baseUrl: 'http://localhost:3000' });
            const r = await adapter.upload(
                'p1',
                'x.bin',
                Buffer.from('a'),
                'application/octet-stream'
            );
            expect(r.url).toContain('/api/static/assets/');
        } finally {
            if (prev === undefined) delete process.env.API_BASE_PATH;
            else process.env.API_BASE_PATH = prev;
        }
    });

    it('writes under project assets only', async () => {
        const adapter = new LocalAdapter({ baseUrl: 'http://localhost' });
        await adapter.upload('p1', 'x.bin', Buffer.from('hello'), 'application/octet-stream');
        const assetsDir = path.join(tmpRoot, 'data', 'projects', 'p1', 'assets', 'original');
        const files = fs.readdirSync(assetsDir);
        expect(files.length).toBe(1);
        expect(files[0]).toBe('x.bin');
        expect(fs.readFileSync(path.join(assetsDir, 'x.bin'))).toEqual(Buffer.from('hello'));
    });
});
