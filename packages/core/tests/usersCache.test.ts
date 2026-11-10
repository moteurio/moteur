import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { createUser, getUserByEmail, reloadUsers } = await import('../src/users.js');

const account = (id: string, email: string) => ({
    id,
    email,
    name: id,
    isActive: true,
    roles: [],
    projects: []
});

/** Writes users.json the way another process does: a temporary file, then a rename. */
function writeFromAnotherProcess(file: string, users: unknown[]): void {
    const temp = `${file}.other-process`;
    fs.writeFileSync(temp, JSON.stringify(users));
    fs.renameSync(temp, file);
}

describe('the users cache', () => {
    let root: string;
    let file: string;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-users-cache-'));
        file = path.join(root, 'users.json');
        vi.stubEnv('DATA_ROOT', root);
        vi.stubEnv('AUTH_USERS_FILE', file);
        fs.writeFileSync(file, JSON.stringify([account('a', 'a@test.local')]));
        reloadUsers();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        reloadUsers();
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('sees an account that another process added to the file', () => {
        expect(getUserByEmail('a@test.local')).toBeDefined();
        writeFromAnotherProcess(file, [account('a', 'a@test.local'), account('b', 'b@test.local')]);
        expect(getUserByEmail('b@test.local')?.id).toBe('b');
    });

    it('keeps an account that another process added when it creates the next one', async () => {
        expect(getUserByEmail('a@test.local')).toBeDefined();
        writeFromAnotherProcess(file, [account('a', 'a@test.local'), account('b', 'b@test.local')]);
        await createUser(account('c', 'c@test.local'));
        const stored = JSON.parse(fs.readFileSync(file, 'utf-8')) as { id: string }[];
        expect(stored.map(u => u.id).sort()).toEqual(['a', 'b', 'c']);
    });
});
