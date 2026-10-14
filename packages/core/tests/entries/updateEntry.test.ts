import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import type { Entry } from '@moteurio/types/Model.js';
import { getProjectJson, putProjectJson } from '../../src/utils/projectStorage.js';
import { entryKey, modelKey } from '../../src/utils/storageKeys.js';
import { mergeEntryPatch, updateEntry } from '../../src/entries.js';

const stored: Entry = {
    id: 'e1',
    type: 'article',
    status: 'draft',
    data: {
        title: { en: 'Title', fr: 'Titre' },
        slug: 'title',
        body: [{ type: 'core/text', data: { text: 'Hello' } }],
        uuid: 'stored-uuid'
    },
    meta: {
        audit: { revision: 3, publishedRevision: 2, publishedCommit: 'abc123' }
    }
};

describe('mergeEntryPatch', () => {
    it('keeps fields left out of a partial update', () => {
        const merged = mergeEntryPatch(stored, { data: { slug: 'new-slug' } });
        expect(merged.data).toEqual({ ...stored.data, slug: 'new-slug' });
    });

    it('replaces each sent field as a whole (no deep merge)', () => {
        const merged = mergeEntryPatch(stored, { data: { title: { en: 'Only English' } } });
        expect(merged.data?.title).toEqual({ en: 'Only English' });
    });

    it('clears a field sent as null', () => {
        const merged = mergeEntryPatch(stored, { data: { slug: null } });
        expect(merged.data?.slug).toBeNull();
        expect(merged.data?.title).toEqual(stored.data?.title);
    });

    it('keeps data when the patch has none', () => {
        const merged = mergeEntryPatch(stored, { status: 'in_review' });
        expect(merged.status).toBe('in_review');
        expect(merged.data).toEqual(stored.data);
    });

    it('ignores core-id fields, the id and audit metadata', () => {
        const merged = mergeEntryPatch(
            stored,
            {
                id: 'other',
                data: { uuid: 'client-uuid', slug: 's' },
                meta: { audit: { revision: 1 } }
            } as Partial<Entry>,
            ['uuid']
        );
        expect(merged.id).toBe('e1');
        expect(merged.data?.uuid).toBe('stored-uuid');
        expect(merged.meta?.audit).toEqual(stored.meta?.audit);
    });

    it('does not mutate its inputs', () => {
        const before = JSON.stringify(stored);
        const patch = { data: { slug: 'x' } };
        mergeEntryPatch(stored, patch);
        expect(JSON.stringify(stored)).toBe(before);
        expect(patch).toEqual({ data: { slug: 'x' } });
    });
});

describe('updateEntry', () => {
    const projectId = 'update-test';
    const user = {
        id: 'u1',
        name: 'Alice',
        isActive: true,
        roles: ['admin'],
        projects: [projectId]
    };
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-update-test-'));
        const projDir = path.join(tempDir, 'data', 'projects', projectId);
        await fs.mkdir(projDir, { recursive: true });
        vi.stubEnv('DATA_ROOT', tempDir);
        await fs.writeFile(
            path.join(projDir, 'project.json'),
            JSON.stringify({ id: projectId, label: 'Update', defaultLocale: 'en', users: ['u1'] })
        );
        // No core/id field: this model took the code path that replaced `data` wholesale.
        await putProjectJson(projectId, modelKey('article'), {
            id: 'article',
            label: 'Article',
            fields: { title: { type: 'core/text' }, slug: { type: 'core/text' } }
        });
        await putProjectJson(projectId, entryKey('article', 'e1'), stored);
    });

    afterEach(async () => {
        vi.unstubAllEnvs();
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('keeps fields a partial update leaves out, on disk', async () => {
        const result = await updateEntry(user, projectId, 'article', 'e1', {
            data: { slug: 'renamed' }
        });
        expect(result.data).toEqual({ ...stored.data, slug: 'renamed' });

        const onDisk = await getProjectJson<Entry>(projectId, entryKey('article', 'e1'));
        expect(onDisk?.data).toEqual({ ...stored.data, slug: 'renamed' });
    });
});
