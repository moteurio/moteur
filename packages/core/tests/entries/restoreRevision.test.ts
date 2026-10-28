import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { initRepo, getLog } from '../../src/git/index.js';
import { addAndCommit } from '../../src/git/gitService.js';
import { getProjectJson, putProjectJson } from '../../src/utils/projectStorage.js';
import { entryKey, modelKey } from '../../src/utils/storageKeys.js';
import { getEntryRevisions, restoreEntryAtRevision } from '../../src/entries.js';
import { onEvent } from '../../src/utils/eventBus.js';
import type { Entry } from '@moteurio/types/Model.js';
import type { User } from '@moteurio/types/User.js';

const projectId = 'restore-test-proj';
const modelId = 'articles';
const entryId = 'post-1';
const user: User = {
    id: 'u1',
    name: 'Alice',
    email: 'alice@test.com',
    isActive: true,
    projects: [projectId],
    roles: ['admin']
};

const messages: string[] = [];
onEvent('content.saved', p => void messages.push(p.message));

function entry(data: Record<string, unknown>, extra: Partial<Entry> = {}): Entry {
    return {
        id: entryId,
        type: modelId,
        status: 'draft',
        data,
        meta: { audit: { createdAt: '2025-01-01T00:00:00Z', createdBy: 'u1', revision: 1 } },
        ...extra
    };
}

describe('restoreEntryAtRevision', () => {
    let tempDir: string;
    let projDir: string;

    beforeEach(async () => {
        messages.length = 0;
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-restore-test-'));
        projDir = path.join(tempDir, 'data', 'projects', projectId);
        await fs.mkdir(projDir, { recursive: true });
        vi.stubEnv('DATA_ROOT', tempDir);
        await fs.writeFile(
            path.join(projDir, 'project.json'),
            JSON.stringify({ id: projectId, label: 'Test', defaultLocale: 'en', users: [user.id] }),
            'utf-8'
        );
        await initRepo(projDir);
        await putProjectJson(projectId, modelKey(modelId), {
            id: modelId,
            label: 'Articles',
            fields: {
                title: { type: 'core/text', label: 'Title' },
                summary: { type: 'core/text', label: 'Summary' }
            }
        });
    });

    afterEach(async () => {
        vi.unstubAllEnvs();
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    });

    async function save(e: Entry, message: string): Promise<void> {
        await putProjectJson(projectId, entryKey(modelId, entryId), e);
        await addAndCommit(projDir, [entryKey(modelId, entryId)], message, user);
    }

    it('puts the old content back as a new save and keeps the later ones', async () => {
        await save(
            entry(
                { title: 'First' },
                {
                    meta: {
                        audit: { revision: 1 },
                        assisted: { title: { helper: 'write', keptBy: 'u2' } }
                    }
                }
            ),
            'Create articles/post-1 — Alice'
        );
        const [first] = await getEntryRevisions(projectId, modelId, entryId);
        await save(
            entry(
                { title: 'Second', summary: 'Added later' },
                {
                    status: 'published',
                    meta: { audit: { revision: 2, publishedCommit: 'f'.repeat(40) } }
                }
            ),
            'Update articles/post-1 — Alice'
        );

        const { restored, changed } = await restoreEntryAtRevision(
            user,
            projectId,
            modelId,
            entryId,
            first.id
        );
        expect(changed).toBe(true);

        // The whole version comes back: the summary filled since is emptied again.
        expect(restored.data).toEqual({ title: 'First' });
        expect(restored.meta?.assisted).toEqual({ title: { helper: 'write', keptBy: 'u2' } });
        // Status and the published version are not part of a restore.
        expect(restored.status).toBe('published');
        expect(restored.meta?.audit?.publishedCommit).toBe('f'.repeat(40));
        const stored = await getProjectJson<Entry>(projectId, entryKey(modelId, entryId));
        expect(stored?.data).toEqual({ title: 'First' });
        expect(messages).toEqual([`Restore articles/post-1 from ${first.id.slice(0, 7)} — Alice`]);
        // Nothing was rewritten: both earlier saves are still in the history.
        expect(await getLog(projDir, entryKey(modelId, entryId), 10)).toHaveLength(2);
    });

    it('refuses a revision the entry was never saved in', async () => {
        await save(entry({ title: 'First' }), 'Create articles/post-1 — Alice');
        await expect(
            restoreEntryAtRevision(user, projectId, modelId, entryId, 'a'.repeat(40))
        ).rejects.toThrow(/not found/);
    });

    it('lets no translator restore', async () => {
        await save(entry({ title: 'First' }), 'Create articles/post-1 — Alice');
        const [first] = await getEntryRevisions(projectId, modelId, entryId);
        const translator = { ...user, roles: ['translator'] } as User;
        await expect(
            restoreEntryAtRevision(translator, projectId, modelId, entryId, first.id)
        ).rejects.toThrow(/translator/);
    });
});
