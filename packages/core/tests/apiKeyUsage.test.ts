import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/projects.js', () => ({
    getProject: vi.fn(),
    getProjectById: vi.fn(),
    updateProject: vi.fn(),
    loadProjects: vi.fn(() => [])
}));

const { getProject, updateProject } = await import('../src/projects.js');
const { listProjectApiKeyMeta, rotateKey } = await import('../src/projectApiKey.js');
const { noteApiKeyUse, apiKeyLastUses } = await import('../src/apiKeyUsage.js');

const key = (id: string) => ({
    id,
    hash: 'a'.repeat(64),
    prefix: 'mk_live_...',
    createdAt: '2026-10-01T00:00:00.000Z'
});

describe('API key last use', () => {
    let root: string;
    const store = () => path.join(root, 'api-key-usage.json');

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-key-usage-'));
        vi.stubEnv('AUTH_USERS_FILE', path.join(root, 'users.json'));
        vi.mocked(getProject).mockResolvedValue({
            id: 'p1',
            apiKeys: [key('used'), key('unused')]
        } as any);
        vi.mocked(updateProject).mockResolvedValue({} as any);
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('lists when a key was last used, and nothing for one never used', async () => {
        const at = Date.parse('2026-10-31T12:00:00.000Z');
        noteApiKeyUse('p1', 'used', at);
        const keys = await listProjectApiKeyMeta('p1', {} as any);
        expect(keys.find(k => k.id === 'used')?.lastUsedAt).toBe('2026-10-31T12:00:00.000Z');
        expect(keys.find(k => k.id === 'unused')).not.toHaveProperty('lastUsedAt');
        for (const k of keys) expect(k).not.toHaveProperty('hash');
    });

    it('keeps it out of the project file, and writes at most once a minute per key', () => {
        const at = Date.parse('2026-10-31T12:00:00.000Z');
        noteApiKeyUse('p1', 'used', at);
        expect(JSON.parse(fs.readFileSync(store(), 'utf8'))).toEqual({
            p1: { used: '2026-10-31T12:00:00.000Z' }
        });
        noteApiKeyUse('p1', 'used', at + 30_000);
        // Not written yet, but known: the list is never more than a minute behind.
        expect(JSON.parse(fs.readFileSync(store(), 'utf8')).p1.used).toBe(
            '2026-10-31T12:00:00.000Z'
        );
        expect(apiKeyLastUses('p1').used).toBe('2026-10-31T12:00:30.000Z');
        noteApiKeyUse('p1', 'used', at + 61_000);
        expect(JSON.parse(fs.readFileSync(store(), 'utf8')).p1.used).toBe(
            '2026-10-31T12:01:01.000Z'
        );
        expect(updateProject).not.toHaveBeenCalled();
    });

    it('forgets the last use when the key is rotated', async () => {
        noteApiKeyUse('p1', 'used', Date.parse('2026-10-31T12:00:00.000Z'));
        await rotateKey('p1', {} as any, 'used');
        expect(apiKeyLastUses('p1')).not.toHaveProperty('used');
    });
});
