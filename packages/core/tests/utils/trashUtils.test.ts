import { beforeEach, afterAll, describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { moveToTrash, restoreFromTrash, deleteTrashedItem } from '../../src/utils/trashUtils';

let tmpBase: string;
let sourceFile: string;
let trashFile: string;
let restoreFile: string;

beforeEach(async () => {
    tmpBase = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'moteur-trashUtils-'));
    sourceFile = path.join(tmpBase, 'test.txt');
    trashFile = path.join(tmpBase, '.trash', 'test.txt');
    restoreFile = path.join(tmpBase, 'restored.txt');

    fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
    fs.writeFileSync(sourceFile, 'Hello, world!', 'utf-8');
});

afterAll(() => {
    if (tmpBase && fs.existsSync(tmpBase)) {
        fs.rmSync(tmpBase, { recursive: true, force: true });
    }
});

describe('trashUtils', () => {
    it('moves a file to the trash', () => {
        moveToTrash(sourceFile, trashFile);
        expect(fs.existsSync(sourceFile)).toBe(false);
        expect(fs.existsSync(trashFile)).toBe(true);
        expect(fs.readFileSync(trashFile, 'utf-8')).toBe('Hello, world!');
    });

    it('restores a file from the trash', () => {
        moveToTrash(sourceFile, trashFile);
        restoreFromTrash(trashFile, restoreFile);
        expect(fs.existsSync(trashFile)).toBe(false);
        expect(fs.existsSync(restoreFile)).toBe(true);
        expect(fs.readFileSync(restoreFile, 'utf-8')).toBe('Hello, world!');
    });

    it('deletes a trashed file permanently', () => {
        moveToTrash(sourceFile, trashFile);
        deleteTrashedItem(trashFile);
        expect(fs.existsSync(trashFile)).toBe(false);
    });

    it('does nothing if trashed file does not exist', () => {
        expect(() => deleteTrashedItem(trashFile)).not.toThrow();
    });
});
