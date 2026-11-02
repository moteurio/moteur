import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { ModelSchema } from '@moteurio/types/Model.js';
import { initRepo } from '../../src/git/index.js';
import { gitIdle } from '../../src/git/gitService.js';
import { putProjectJson } from '../../src/utils/projectStorage.js';
import { modelKey } from '../../src/utils/storageKeys.js';
import { createEntry, settingsEntryId } from '../../src/entries.js';

const projectId = 'settings-site';
const user = { id: 'u1', name: 'Ada', isActive: true, roles: ['admin'], projects: [projectId] };
const settings: ModelSchema = {
    id: 'site-settings',
    label: 'Site settings',
    modelType: 'settings',
    fields: { title: { type: 'core/text', label: 'Title' } }
} as ModelSchema;
const post: ModelSchema = { id: 'post', label: 'Post', fields: {} } as ModelSchema;

describe('a settings model', () => {
    let tempDir: string;
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-settings-'));
        const projDir = path.join(tempDir, 'data', 'projects', projectId);
        await fs.mkdir(projDir, { recursive: true });
        vi.stubEnv('DATA_ROOT', tempDir);
        await fs.writeFile(
            path.join(projDir, 'project.json'),
            JSON.stringify({ id: projectId, label: 'S', defaultLocale: 'en', users: ['u1'] })
        );
        await initRepo(projDir);
        await putProjectJson(projectId, modelKey('site-settings'), settings);
        await putProjectJson(projectId, modelKey('post'), post);
    });
    afterEach(async () => {
        await gitIdle();
        vi.unstubAllEnvs();
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('holds one entry, and says so for a second', async () => {
        expect(await settingsEntryId(projectId, 'site-settings')).toBeUndefined();
        await createEntry(user, projectId, 'site-settings', {
            id: 'site',
            type: 'site-settings',
            data: { title: 'Moteur' }
        });
        expect(await settingsEntryId(projectId, 'site-settings')).toBe('site');
        await expect(
            createEntry(user, projectId, 'site-settings', {
                id: 'other',
                type: 'site-settings',
                data: {}
            })
        ).rejects.toMatchObject({ status: 409, code: 'SETTINGS_ONE_ENTRY' });
    });

    it('is the only kind with one entry, and the only kind read as "the" entry', async () => {
        await createEntry(user, projectId, 'post', { id: 'a', type: 'post', data: {} });
        await createEntry(user, projectId, 'post', { id: 'b', type: 'post', data: {} });
        await expect(settingsEntryId(projectId, 'post')).rejects.toMatchObject({ status: 404 });
    });
});
