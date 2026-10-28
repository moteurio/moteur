import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initRepo, addAndCommit } from '../src/git/index.js';
import { putProjectJson } from '../src/utils/projectStorage.js';
import { modelKey } from '../src/utils/storageKeys.js';
import type { ModelSchema } from '@moteurio/types/Model.js';
import {
    getSchemaAtRevision,
    getSchemaRevisions,
    projectSchemaGitPath,
    restoreSchemaAtRevision
} from '../src/schemaRevisions.js';

const testUser = {
    id: 'u1',
    name: 'Tester',
    email: 't@test.io',
    isActive: true,
    roles: [],
    projects: ['demo']
};

describe('schemaRevisions', () => {
    let root: string;
    let projectId: string;
    let projDir: string;

    beforeEach(async () => {
        root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'moteur-schema-rev-'));
        vi.stubEnv('DATA_ROOT', root);
        projectId = 'demo';
        projDir = path.join(root, 'data', 'projects', projectId);
        await fs.promises.mkdir(projDir, { recursive: true });
        await fs.promises.writeFile(
            path.join(projDir, 'project.json'),
            JSON.stringify({
                id: projectId,
                label: 'Demo',
                defaultLocale: 'en',
                users: [testUser.id]
            }),
            'utf-8'
        );
        initRepo(projDir);
    });

    afterEach(async () => {
        vi.unstubAllEnvs();
        await fs.promises.rm(root, { recursive: true, force: true }).catch(() => {});
    });

    it('lists and reads model schema revisions', async () => {
        const v1: ModelSchema = {
            id: 'article',
            label: 'Article',
            fields: { title: { type: 'text', label: 'Title' } }
        };
        await putProjectJson(projectId, modelKey('article'), v1);
        await addAndCommit(projDir, [modelKey('article')], 'Create model article', testUser);

        const v2 = { ...v1, label: 'Article v2' };
        await putProjectJson(projectId, modelKey('article'), v2);
        await addAndCommit(projDir, [modelKey('article')], 'Update model article', testUser);

        const gitPath = await projectSchemaGitPath(projectId, 'model', 'article');
        expect(gitPath).toBe(modelKey('article'));

        const revisions = await getSchemaRevisions(projectId, 'model', 'article', gitPath!, 10);
        expect(revisions.length).toBeGreaterThanOrEqual(2);

        const old = await getSchemaAtRevision(projectId, gitPath!, revisions[1].id);
        expect(old?.label).toBe('Article');
    });

    it('restores a model from a revision', async () => {
        const v1: ModelSchema = {
            id: 'page',
            label: 'Page',
            fields: { title: { type: 'text', label: 'Title' } }
        };
        await putProjectJson(projectId, modelKey('page'), v1);
        await addAndCommit(projDir, [modelKey('page')], 'Create model page', testUser);

        const v2 = {
            ...v1,
            fields: {
                title: { type: 'text', label: 'Title' },
                body: { type: 'text', label: 'Body' }
            }
        };
        await putProjectJson(projectId, modelKey('page'), v2);
        await addAndCommit(projDir, [modelKey('page')], 'Add body field', testUser);

        const gitPath = (await projectSchemaGitPath(projectId, 'model', 'page'))!;
        const [, first] = await getSchemaRevisions(projectId, 'model', 'page', gitPath, 10);
        await restoreSchemaAtRevision(testUser, projectId, 'model', 'page', gitPath, first.id);
        const current = await import('../src/models.js').then(m =>
            m.getModelSchema(testUser, projectId, 'page')
        );
        expect(current.fields.body).toBeUndefined();
    });
});
