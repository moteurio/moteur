import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { Entry } from '@moteurio/types/Model.js';
import { initRepo } from '../../src/git/index.js';
import { getProjectJson, putProjectJson } from '../../src/utils/projectStorage.js';
import { entryKey, modelKey } from '../../src/utils/storageKeys.js';
import { getPublishedEntryForProject, publishEntry, updateEntry } from '../../src/entries.js';
import * as publishedCache from '../../src/git/publishedContentCache.js';
import { onEvent } from '../../src/utils/eventBus.js';
import auditPlugin from '../../src/plugins/core/auditLogger.js';
import type { PluginContext } from '../../src/plugins/pluginContext.js';

// Revisions are bumped by the audit plugin, as in the server.
auditPlugin.init({ onEvent } as unknown as PluginContext);

const projectId = 'publish-revision';
const user = { id: 'u1', name: 'Ada', isActive: true, roles: ['admin'], projects: [projectId] };

describe('publishEntry revisions', () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-publish-rev-'));
        const projDir = path.join(tempDir, 'data', 'projects', projectId);
        await fs.mkdir(projDir, { recursive: true });
        vi.stubEnv('DATA_ROOT', tempDir);
        await fs.writeFile(
            path.join(projDir, 'project.json'),
            JSON.stringify({ id: projectId, label: 'P', defaultLocale: 'en', users: ['u1'] })
        );
        await initRepo(projDir);
        await putProjectJson(projectId, modelKey('article'), {
            id: 'article',
            label: 'A',
            fields: {}
        });
        await putProjectJson(projectId, entryKey('article', 'e1'), {
            id: 'e1',
            type: 'article',
            data: { title: 'v1' },
            // An entry that has already been edited a few times.
            meta: { audit: { revision: 3, createdAt: '2025-01-01T00:00:00Z' } }
        } as Entry);
        publishedCache.clear();
    });

    afterEach(async () => {
        vi.unstubAllEnvs();
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('a freshly published entry has no edits since publishing', async () => {
        const published = await publishEntry(user, projectId, 'article', 'e1');
        expect(published.meta?.audit?.publishedRevision).toBe(published.meta?.audit?.revision);

        const onDisk = await getProjectJson<Entry>(projectId, entryKey('article', 'e1'));
        expect(onDisk?.meta?.audit?.publishedRevision).toBe(onDisk?.meta?.audit?.revision);

        // Served from the entry file: no git read needed.
        expect((await getPublishedEntryForProject(projectId, 'article', 'e1'))?.data?.title).toBe(
            'v1'
        );
        expect(publishedCache.size()).toBe(1); // only the write-through from publishing
    });

    it('an edit after publishing is detected, and the published version is kept', async () => {
        await publishEntry(user, projectId, 'article', 'e1');
        const edited = await updateEntry(user, projectId, 'article', 'e1', {
            data: { title: 'v2' }
        });
        expect(edited.meta!.audit!.revision!).toBeGreaterThan(
            edited.meta!.audit!.publishedRevision!
        );
        expect((await getPublishedEntryForProject(projectId, 'article', 'e1'))?.data?.title).toBe(
            'v1'
        );
    });
});
