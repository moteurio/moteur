import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
    getProjectJson,
    putProjectJson,
    listProjectKeys,
    deleteProjectKey
} from '../../src/utils/projectStorage.js';
import { queryEntriesForProject } from '../../src/entries.js';

describe('project storage confinement', () => {
    let root: string;
    beforeEach(async () => {
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-project-scope-'));
        vi.stubEnv('DATA_ROOT', root);
        await putProjectJson('other', 'project.json', { private: 'other project data' });
    });
    afterEach(async () => {
        vi.unstubAllEnvs();
        await fs.rm(root, { recursive: true, force: true });
    });
    it('blocks reads, writes, listings and deletions outside the requested project', async () => {
        await expect(getProjectJson('own', '../other/project.json')).rejects.toMatchObject({
            status: 400
        });
        await expect(putProjectJson('own', '../other/project.json', {})).rejects.toMatchObject({
            status: 400
        });
        await expect(listProjectKeys('own', '../other')).rejects.toMatchObject({ status: 400 });
        await expect(deleteProjectKey('own', '../other/project.json')).rejects.toMatchObject({
            status: 400
        });
        expect(await getProjectJson('other', 'project.json')).toEqual({
            private: 'other project data'
        });
    });
    it('rejects traversal through project IDs and delivery model IDs', async () => {
        await expect(getProjectJson('../other', 'project.json')).rejects.toMatchObject({
            status: 400
        });
        await expect(
            queryEntriesForProject('own', '../../other/models/private')
        ).rejects.toMatchObject({ status: 400 });
    });
});
