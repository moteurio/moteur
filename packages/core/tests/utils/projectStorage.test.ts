import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
    getProjectJson,
    putProjectJson,
    hasProjectKey,
    deleteProjectKey,
    listProjectKeys
} from '../../src/utils/projectStorage.js';

describe('projectStorage', () => {
    let dataRoot: string;
    const projectId = 'testproj';

    beforeEach(async () => {
        dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-storage-test-'));
        const projectsDir = path.join(dataRoot, 'data', 'projects');
        const projectDir = path.join(projectsDir, projectId);
        await fs.mkdir(projectDir, { recursive: true });
        vi.stubEnv('DATA_ROOT', dataRoot);
    });

    afterEach(async () => {
        vi.unstubAllEnvs();
        await fs.rm(dataRoot, { recursive: true, force: true }).catch(() => {});
    });

    it('getProjectJson returns null for missing key', async () => {
        const out = await getProjectJson(projectId, 'missing.json');
        expect(out).toBeNull();
    });

    it('putProjectJson and getProjectJson round-trip', async () => {
        await putProjectJson(projectId, 'test.json', { foo: 'bar' });
        const out = await getProjectJson<{ foo: string }>(projectId, 'test.json');
        expect(out).toEqual({ foo: 'bar' });
    });

    it('hasProjectKey returns true when key exists', async () => {
        await putProjectJson(projectId, 'k.json', {});
        expect(await hasProjectKey(projectId, 'k.json')).toBe(true);
    });

    it('hasProjectKey returns false when key missing', async () => {
        expect(await hasProjectKey(projectId, 'missing.json')).toBe(false);
    });

    it('deleteProjectKey removes key', async () => {
        await putProjectJson(projectId, 'del.json', {});
        await deleteProjectKey(projectId, 'del.json');
        expect(await getProjectJson(projectId, 'del.json')).toBeNull();
    });

    it('listProjectKeys returns directory entries', async () => {
        await putProjectJson(projectId, 'a/b.json', {});
        const keys = await listProjectKeys(projectId, 'a');
        expect(keys).toContain('b.json');
    });
});
