import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
    resolveInputData,
    resolveInputDataSync,
    getBodyFromArgs
} from '../src/utils/resolveInputData.js';

describe('resolveInputData', () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'moteur-cli-test-'));
    });

    afterEach(async () => {
        try {
            await fs.promises.rm(tmpDir, { recursive: true });
        } catch {
            // ignore
        }
    });

    it('reads JSON from file', async () => {
        const filePath = path.join(tmpDir, 'body.json');
        await fs.promises.writeFile(filePath, '{"id":"my-blog","label":"My Blog"}', 'utf-8');
        const result = await resolveInputData({ file: filePath });
        expect(result).toEqual({ id: 'my-blog', label: 'My Blog' });
    });

    it('throws when file not found', async () => {
        await expect(resolveInputData({ file: path.join(tmpDir, 'missing.json') })).rejects.toThrow(
            /File not found|project\.json/
        );
    });

    it('throws when file has invalid JSON', async () => {
        const filePath = path.join(tmpDir, 'bad.json');
        await fs.promises.writeFile(filePath, 'not json', 'utf-8');
        await expect(resolveInputData({ file: filePath })).rejects.toThrow(/Invalid JSON/);
    });

    it('parses --data inline JSON', async () => {
        const result = await resolveInputData({ data: '{"x":1}' });
        expect(result).toEqual({ x: 1 });
    });

    it('throws when --data is invalid JSON', async () => {
        await expect(resolveInputData({ data: 'not json' })).rejects.toThrow(/Invalid.*data/);
    });

    it('returns empty object when allowEmpty and no input', async () => {
        const result = await resolveInputData({ allowEmpty: true });
        expect(result).toEqual({});
    });

    it('throws when no input and not allowEmpty', async () => {
        await expect(resolveInputData({})).rejects.toThrow(/Provide --file|--data|stdin/);
    });
});

describe('resolveInputDataSync', () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'moteur-cli-sync-'));
    });

    afterEach(async () => {
        try {
            await fs.promises.rm(tmpDir, { recursive: true });
        } catch {
            // ignore
        }
    });

    it('reads JSON from file synchronously', () => {
        const filePath = path.join(tmpDir, 'body.json');
        fs.writeFileSync(filePath, '{"id":"sync-blog"}', 'utf-8');
        const result = resolveInputDataSync({ file: filePath });
        expect(result).toEqual({ id: 'sync-blog' });
    });

    it('parses --data inline JSON', () => {
        expect(resolveInputDataSync({ data: '{"a":1}' })).toEqual({ a: 1 });
    });

    it('returns empty object when allowEmpty', () => {
        expect(resolveInputDataSync({ allowEmpty: true })).toEqual({});
    });
});

describe('getBodyFromArgs', () => {
    it('returns null when no file, data, or stdin (TTY)', async () => {
        const wasTTY = process.stdin.isTTY;
        Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
        const result = await getBodyFromArgs({});
        Object.defineProperty(process.stdin, 'isTTY', { value: wasTTY, configurable: true });
        expect(result).toBeNull();
    });

    it('returns parsed object when args.data is set', async () => {
        const result = await getBodyFromArgs({ data: '{"from":"data"}' });
        expect(result).toEqual({ from: 'data' });
    });

    it('returns parsed object when args.file is set', async () => {
        const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'moteur-getBody-'));
        const filePath = path.join(tmpDir, 'f.json');
        await fs.promises.writeFile(filePath, '{"from":"file"}', 'utf-8');
        const result = await getBodyFromArgs({ file: filePath });
        await fs.promises.rm(tmpDir, { recursive: true }).catch(() => {});
        expect(result).toEqual({ from: 'file' });
    });
});
