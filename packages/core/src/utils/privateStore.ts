import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { storageConfig } from '../config/storageConfig.js';

/** Private, single-writer account state. Corruption must fail closed, never reset auth state. */
export function privateStatePath(name: string): string {
    return path.join(path.dirname(storageConfig.usersFile), name);
}

export function readPrivateState<T>(file: string, empty: T): T {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return empty;
        throw new Error('Account state could not be read', { cause: error });
    }
}

export function writePrivateState(file: string, value: unknown): void {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const temporary = `${file}.${randomBytes(12).toString('hex')}.tmp`;
    try {
        fs.writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
        fs.renameSync(temporary, file);
    } finally {
        fs.rmSync(temporary, { force: true });
    }
}
