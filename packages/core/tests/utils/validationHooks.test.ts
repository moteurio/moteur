import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createUser, getUserById, reloadUsers } from '../../src/users.js';
import { onEvent, triggerEvent } from '../../src/utils/eventBus.js';

let rejectUser = false;
onEvent('user.beforeCreate', async () => {
    await Promise.resolve();
    if (rejectUser) throw new Error('Async validation rejected this account');
});
describe('validation and notification hook boundaries', () => {
    let root: string;
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-hook-'));
        vi.stubEnv('AUTH_USERS_FILE', path.join(root, 'users.json'));
        fs.writeFileSync(path.join(root, 'users.json'), '[]');
        reloadUsers();
    });
    afterEach(() => {
        rejectUser = false;
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
        reloadUsers();
        fs.rmSync(root, { recursive: true, force: true });
    });
    it('awaits asynchronous validation before persisting a synchronous-origin service', async () => {
        rejectUser = true;
        await expect(
            createUser({
                id: 'u1',
                email: 'new@example.test',
                isActive: true,
                roles: [],
                projects: []
            })
        ).rejects.toThrow('Async validation');
        expect(JSON.parse(fs.readFileSync(path.join(root, 'users.json'), 'utf8'))).toEqual([]);
        expect(getUserById('u1')).toBeUndefined();
    });
    it('isolates failed after-event handlers and still calls later listeners', async () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        const later = vi.fn();
        onEvent('entry.afterUpdate', async () => {
            throw new Error('Notification failed');
        });
        onEvent('entry.afterUpdate', later);
        await expect(triggerEvent('entry.afterUpdate', {} as never)).resolves.toBeUndefined();
        expect(log).toHaveBeenCalled();
        expect(later).toHaveBeenCalledOnce();
    });
});
