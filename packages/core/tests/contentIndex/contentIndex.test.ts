import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import type { Entry } from '@moteurio/types/Model.js';
import { initRepo, addAndCommit, readBlobs } from '../../src/git/gitService.js';
import { putProjectJson } from '../../src/utils/projectStorage.js';
import { entryKey, modelKey } from '../../src/utils/storageKeys.js';
import {
    deleteEntry,
    getPublishedEntryForProject,
    listEntriesForProject,
    listPublishedEntriesForProject,
    publishEntry,
    queryEntriesForProject,
    updateEntry
} from '../../src/entries.js';
import { getContentIndex, resetContentIndex } from '../../src/contentIndex/index.js';
import * as publishedCache from '../../src/git/publishedContentCache.js';
import { onEvent } from '../../src/utils/eventBus.js';
import auditPlugin from '../../src/plugins/core/auditLogger.js';
import type { PluginContext } from '../../src/plugins/pluginContext.js';

// Revisions are bumped by the audit plugin, as in the server.
auditPlugin.init({ onEvent } as unknown as PluginContext);

const projectId = 'index-test';
const modelId = 'articles';
const user = {
    id: 'u1',
    name: 'Alice',
    email: 'alice@test.com',
    isActive: true,
    roles: ['admin'],
    projects: [projectId]
};

function entry(id: string, status: Entry['status'], updatedAt: string, title = id): Entry {
    return {
        id,
        type: modelId,
        status,
        data: { title },
        meta: { audit: { createdAt: updatedAt, updatedAt, revision: 1 } }
    };
}

for (const adapter of ['sqlite', 'files'] as const) {
    describe(`content index (${adapter})`, () => {
        let tempDir: string;
        let projDir: string;

        beforeEach(async () => {
            tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-index-test-'));
            projDir = path.join(tempDir, 'data', 'projects', projectId);
            await fs.mkdir(projDir, { recursive: true });
            vi.stubEnv('DATA_ROOT', tempDir);
            vi.stubEnv('MOTEUR_CONTENT_INDEX', adapter);
            vi.stubEnv('MOTEUR_CONTENT_INDEX_RECHECK_MS', '0');
            await resetContentIndex();
            await fs.writeFile(
                path.join(projDir, 'project.json'),
                JSON.stringify({
                    id: projectId,
                    label: 'Index',
                    defaultLocale: 'en',
                    users: ['u1']
                })
            );
            await initRepo(projDir);
            await putProjectJson(projectId, modelKey(modelId), {
                id: modelId,
                label: 'Articles',
                fields: {}
            });
            publishedCache.clear();
        });

        afterEach(async () => {
            await resetContentIndex();
            vi.unstubAllEnvs();
            await fs.rm(tempDir, { recursive: true, force: true });
        });

        async function seed(entries: Entry[]): Promise<void> {
            for (const e of entries) await putProjectJson(projectId, entryKey(modelId, e.id), e);
            addAndCommit(projDir, ['models'], 'seed', user);
        }

        it('uses the configured adapter', async () => {
            expect((await getContentIndex()).kind).toBe(adapter);
        });

        it('filters by status, sorts and pages with a total', async () => {
            await seed([
                entry('a', 'published', '2025-01-03T00:00:00Z'),
                entry('b', 'draft', '2025-01-01T00:00:00Z'),
                entry('c', 'published', '2025-01-02T00:00:00Z'),
                entry('d', 'published', '2025-01-04T00:00:00Z')
            ]);

            const all = await queryEntriesForProject(projectId, modelId);
            expect(all.items.map(e => e.id)).toEqual(['a', 'b', 'c', 'd']);
            expect(all.total).toBe(4);

            const page = await queryEntriesForProject(projectId, modelId, {
                status: ['published'],
                sort: { field: 'updatedAt', direction: 'desc' },
                limit: 2,
                offset: 1
            });
            expect(page.items.map(e => e.id)).toEqual(['a', 'c']);
            expect(page.total).toBe(3);

            const none = await queryEntriesForProject(projectId, modelId, { status: [] });
            expect(none).toEqual({ items: [], total: 0 });
        });

        it('keeps listEntriesForProject defaults (published only)', async () => {
            await seed([
                entry('a', 'published', '2025-01-01T00:00:00Z'),
                entry('b', 'draft', '2025-01-01T00:00:00Z')
            ]);
            expect((await listEntriesForProject(projectId, modelId)).map(e => e.id)).toEqual(['a']);
            expect(
                (await listEntriesForProject(projectId, modelId, { status: ['draft'] })).map(
                    e => e.id
                )
            ).toEqual(['b']);
        });

        it('sees writes and deletes made through core immediately', async () => {
            await seed([entry('a', 'draft', '2025-01-01T00:00:00Z')]);
            expect((await queryEntriesForProject(projectId, modelId)).total).toBe(1);

            await putProjectJson(
                projectId,
                entryKey(modelId, 'b'),
                entry('b', 'draft', '2025-01-02T00:00:00Z')
            );
            await updateEntry(user, projectId, modelId, 'a', { data: { title: 'Renamed' } });
            const afterWrite = await queryEntriesForProject(projectId, modelId);
            expect(afterWrite.items.map(e => [e.id, e.data?.title])).toEqual([
                ['a', 'Renamed'],
                ['b', 'b']
            ]);

            await deleteEntry(user, projectId, modelId, 'a');
            expect((await queryEntriesForProject(projectId, modelId)).items.map(e => e.id)).toEqual(
                ['b']
            );
        });

        it('serves the publish-time version of entries edited after publishing', async () => {
            await seed([entry('a', 'draft', '2025-01-01T00:00:00Z', 'Live title')]);
            await publishEntry(user, projectId, modelId, 'a');
            await updateEntry(user, projectId, modelId, 'a', { data: { title: 'Edited title' } });

            const latest = await queryEntriesForProject(projectId, modelId);
            expect(latest.items[0].data?.title).toBe('Edited title');

            const published = await listPublishedEntriesForProject(projectId, modelId);
            expect(published.map(e => e.data?.title)).toEqual(['Live title']);
            expect((await getPublishedEntryForProject(projectId, modelId, 'a'))?.data?.title).toBe(
                'Live title'
            );
        });

        it('hides unpublished entries from the published view', async () => {
            await seed([entry('a', 'draft', '2025-01-01T00:00:00Z')]);
            await publishEntry(user, projectId, modelId, 'a');
            await updateEntry(user, projectId, modelId, 'a', { status: 'unpublished' });

            expect(await listPublishedEntriesForProject(projectId, modelId)).toEqual([]);
            const one = await getPublishedEntryForProject(projectId, modelId, 'a');
            expect(one?.status).toBe('unpublished');
        });

        it('picks up files changed outside core after invalidate', async () => {
            await seed([entry('a', 'draft', '2025-01-01T00:00:00Z')]);
            expect((await queryEntriesForProject(projectId, modelId)).total).toBe(1);

            // As after a git pull or a hand edit: files change without core knowing.
            const dir = path.join(projDir, 'models', modelId, 'entries');
            await fs.mkdir(path.join(dir, 'z'), { recursive: true });
            await fs.writeFile(
                path.join(dir, 'z', 'entry.json'),
                JSON.stringify(entry('z', 'draft', '2025-01-01T00:00:00Z'))
            );
            await fs.writeFile(
                path.join(dir, 'a', 'entry.json'),
                JSON.stringify(entry('a', 'draft', '2025-01-01T00:00:00Z', 'Edited on disk!'))
            );

            (await getContentIndex()).invalidate(projectId);
            const items = (await queryEntriesForProject(projectId, modelId)).items;
            expect(items.map(e => [e.id, e.data?.title])).toEqual([
                ['a', 'Edited on disk!'],
                ['z', 'z']
            ]);

            await fs.rm(path.join(dir, 'z'), { recursive: true });
            (await getContentIndex()).invalidate(projectId);
            expect((await queryEntriesForProject(projectId, modelId)).items.map(e => e.id)).toEqual(
                ['a']
            );
        });

        it('returns nothing for a missing project or model', async () => {
            expect(await queryEntriesForProject('no-such-project', modelId)).toEqual({
                items: [],
                total: 0
            });
            expect(await queryEntriesForProject(projectId, 'no-such-model')).toEqual({
                items: [],
                total: 0
            });
            expect(existsSync(path.join(tempDir, 'data', 'projects', 'no-such-project'))).toBe(
                false
            );
        });
    });
}

describe('sqlite content index', () => {
    let tempDir: string;
    let projDir: string;
    const dbFile = () => path.join(projDir, '.moteur', 'cache', 'content-index.sqlite');

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-sqlite-index-'));
        projDir = path.join(tempDir, 'data', 'projects', projectId);
        await fs.mkdir(path.join(projDir, 'models', modelId), { recursive: true });
        vi.stubEnv('DATA_ROOT', tempDir);
        vi.stubEnv('MOTEUR_CONTENT_INDEX', 'sqlite');
        vi.stubEnv('MOTEUR_CONTENT_INDEX_RECHECK_MS', '0');
        await resetContentIndex();
    });

    afterEach(async () => {
        await resetContentIndex();
        vi.unstubAllEnvs();
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    async function writeEntryFile(e: Entry): Promise<void> {
        const dir = path.join(projDir, 'models', modelId, 'entries', e.id);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, 'entry.json'), JSON.stringify(e));
    }

    it('builds from existing files on first use and stores the index under .moteur/cache', async () => {
        await writeEntryFile(entry('a', 'draft', '2025-01-01T00:00:00Z'));
        await writeEntryFile(entry('b', 'draft', '2025-01-01T00:00:00Z'));
        expect((await queryEntriesForProject(projectId, modelId)).total).toBe(2);
        expect(existsSync(dbFile())).toBe(true);
    });

    it('only re-reads files whose mtime or size changed', async () => {
        await writeEntryFile(entry('a', 'draft', '2025-01-01T00:00:00Z'));
        await writeEntryFile(entry('b', 'draft', '2025-01-01T00:00:00Z'));
        const index = await getContentIndex();
        expect(await index.reindex(projectId)).toMatchObject({ scanned: 2, updated: 2 });
        expect(await index.reindex(projectId)).toMatchObject({ scanned: 2, updated: 0 });

        await writeEntryFile(entry('b', 'draft', '2025-01-01T00:00:00Z', 'longer title'));
        expect(await index.reindex(projectId)).toMatchObject({ updated: 1, removed: 0 });
        expect(await index.reindex(projectId, { full: true })).toMatchObject({ updated: 2 });
    });

    it('survives a reopen (another process, or a restart) without re-reading files', async () => {
        await writeEntryFile(entry('a', 'draft', '2025-01-01T00:00:00Z'));
        await queryEntriesForProject(projectId, modelId);
        await resetContentIndex();
        expect(await (await getContentIndex()).reindex(projectId)).toMatchObject({
            scanned: 1,
            updated: 0
        });
    });

    it('rebuilds a corrupt database', async () => {
        await writeEntryFile(entry('a', 'draft', '2025-01-01T00:00:00Z'));
        await queryEntriesForProject(projectId, modelId);
        await resetContentIndex();
        await fs.writeFile(dbFile(), 'this is not a database');
        await fs.rm(`${dbFile()}-wal`, { force: true });
        await fs.rm(`${dbFile()}-shm`, { force: true });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect((await queryEntriesForProject(projectId, modelId)).total).toBe(1);
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('does not serve stale rows when the project directory is replaced', async () => {
        await writeEntryFile(entry('a', 'draft', '2025-01-01T00:00:00Z'));
        expect((await queryEntriesForProject(projectId, modelId)).total).toBe(1);

        await fs.rm(projDir, { recursive: true });
        await fs.mkdir(path.join(projDir, 'models', modelId), { recursive: true });
        await writeEntryFile(entry('fresh', 'draft', '2025-01-01T00:00:00Z'));
        expect((await queryEntriesForProject(projectId, modelId)).items.map(e => e.id)).toEqual([
            'fresh'
        ]);
    });

    it('re-checks files in the background after the recheck interval', async () => {
        vi.stubEnv('MOTEUR_CONTENT_INDEX_RECHECK_MS', '1');
        await resetContentIndex();
        await writeEntryFile(entry('a', 'draft', '2025-01-01T00:00:00Z'));
        expect((await queryEntriesForProject(projectId, modelId)).total).toBe(1);

        await writeEntryFile(entry('b', 'draft', '2025-01-01T00:00:00Z'));
        await new Promise(r => setTimeout(r, 5));
        // This query triggers the re-check and still answers from the current index...
        expect((await queryEntriesForProject(projectId, modelId)).total).toBe(1);
        // ...which the re-check has updated by the time the next query runs.
        await vi.waitFor(async () =>
            expect((await queryEntriesForProject(projectId, modelId)).total).toBe(2)
        );
    });
});

describe('readBlobs', () => {
    it('reads many files at given revisions in one call', async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-blobs-'));
        try {
            await initRepo(dir);
            await fs.writeFile(path.join(dir, 'a.json'), '{"v":1}');
            const first = addAndCommit(dir, ['a.json'], 'one', user);
            await fs.writeFile(path.join(dir, 'a.json'), '{"v":2}\n');
            await fs.writeFile(path.join(dir, 'b.json'), 'é');
            const second = addAndCommit(dir, ['a.json', 'b.json'], 'two', user);

            const blobs = await readBlobs(dir, [
                `${first}:a.json`,
                `${second}:a.json`,
                `${first}:b.json`,
                `${second}:b.json`,
                `${second}:missing.json`
            ]);
            expect([...blobs.values()]).toEqual(['{"v":1}', '{"v":2}\n', null, 'é', null]);

            // Large batches resolve paths from one tree listing per revision.
            const many = Array.from({ length: 100 }, (_, i) =>
                i % 2 ? `${second}:a.json` : `${second}:nope-${i}.json`
            );
            const manyBlobs = await readBlobs(dir, [...many, `${first}:a.json`, 'bad-rev:a.json']);
            expect(manyBlobs.get(`${second}:a.json`)).toBe('{"v":2}\n');
            expect(manyBlobs.get(`${second}:nope-0.json`)).toBeNull();
            expect(manyBlobs.get(`${first}:a.json`)).toBe('{"v":1}');
            expect(manyBlobs.get('bad-rev:a.json')).toBeNull();
        } finally {
            await fs.rm(dir, { recursive: true, force: true });
        }
    });
});
