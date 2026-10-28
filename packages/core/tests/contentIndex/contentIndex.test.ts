import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { gitIdle } from '../../src/git/index.js';
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
            // Commits finish in the background: let them before removing the folder.
            await gitIdle();
            await fs.rm(tempDir, { recursive: true, force: true });
        });

        async function seed(entries: Entry[]): Promise<void> {
            for (const e of entries) await putProjectJson(projectId, entryKey(modelId, e.id), e);
            await addAndCommit(projDir, ['models'], 'seed', user);
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

            // Commits finish in the background: let them before removing the folder.
            await gitIdle();
            await fs.rm(path.join(dir, 'z'), { recursive: true });
            (await getContentIndex()).invalidate(projectId);
            expect((await queryEntriesForProject(projectId, modelId)).items.map(e => e.id)).toEqual(
                ['a']
            );
        });

        describe('list queries', () => {
            const article = (
                id: string,
                data: Record<string, unknown>,
                opts: {
                    status?: Entry['status'];
                    updatedAt: string;
                    updatedBy?: string;
                    edits?: boolean;
                }
            ): Entry => ({
                id,
                type: modelId,
                status: opts.status ?? 'draft',
                data,
                meta: {
                    audit: {
                        createdAt: opts.updatedAt,
                        updatedAt: opts.updatedAt,
                        updatedBy: opts.updatedBy,
                        revision: opts.edits ? 3 : 1,
                        ...(opts.edits && { publishedRevision: 2 })
                    }
                }
            });

            beforeEach(async () => {
                await seed([
                    article(
                        'sous-la-glace',
                        {
                            title: { fr: 'Sous la glace d’Ungava', en: 'Under the ice' },
                            author: { id: 'sophie' },
                            category: 'ocean',
                            tags: ['ice', 'north']
                        },
                        {
                            status: 'published',
                            edits: true,
                            updatedAt: '2025-01-05T00:00:00Z',
                            updatedBy: 'u-sophie'
                        }
                    ),
                    article(
                        'eclair',
                        {
                            title: { fr: 'Éclair au chocolat', en: '' },
                            author: { id: 'celeste' },
                            category: 'food'
                        },
                        {
                            status: 'in_review',
                            updatedAt: '2025-01-04T00:00:00Z',
                            updatedBy: 'u-celeste'
                        }
                    ),
                    article(
                        'paris',
                        {
                            title: { fr: 'Paris, un an après', en: 'Paris, one year on' },
                            author: { id: 'sophie' },
                            category: 'city'
                        },
                        { updatedAt: '2025-01-03T00:00:00Z', updatedBy: 'u-sophie' }
                    ),
                    article(
                        'zebre',
                        { title: { fr: 'Zèbre' }, category: 'food' },
                        { updatedAt: '2025-01-02T00:00:00Z', updatedBy: 'u-celeste' }
                    ),
                    article(
                        'notitle',
                        { category: 'city', body: `${'filler '.repeat(80)}needle` },
                        { status: 'published', updatedAt: '2025-01-01T00:00:00Z' }
                    )
                ]);
            });

            const ids = async (q: Parameters<typeof queryEntriesForProject>[2]) =>
                (await queryEntriesForProject(projectId, modelId, q)).items.map(e => e.id);

            it('searches ids and short texts in every language, ignoring case and accents', async () => {
                expect(await ids({ search: 'ECLAIR' })).toEqual(['eclair']);
                expect(await ids({ search: 'glace ungava' })).toEqual(['sous-la-glace']);
                expect(await ids({ search: 'under ice' })).toEqual(['sous-la-glace']);
                expect(await ids({ search: 'zebre' })).toEqual(['zebre']);
                expect(await ids({ search: 'paris tokyo' })).toEqual([]);
                // Long texts (bodies) are not searched.
                expect(await ids({ search: 'needle' })).toEqual([]);
            });

            it('filters on field values, references, lists and virtual keys', async () => {
                expect(await ids({ filters: { author: ['sophie'] } })).toEqual([
                    'paris',
                    'sous-la-glace'
                ]);
                expect(
                    await ids({ filters: { author: ['sophie'], category: ['food', 'city'] } })
                ).toEqual(['paris']);
                expect(await ids({ filters: { tags: ['north'] } })).toEqual(['sous-la-glace']);
                expect(await ids({ filters: { $workflow: ['edits'] } })).toEqual(['sous-la-glace']);
                expect(await ids({ filters: { $editor: ['u-celeste'] } })).toEqual([
                    'eclair',
                    'zebre'
                ]);
                expect(await ids({ filters: { category: [] } })).toHaveLength(5);
            });

            it('finds entries missing a language', async () => {
                expect(await ids({ missing: { field: 'title', locales: ['en'] } })).toEqual([
                    'eclair',
                    'notitle',
                    'zebre'
                ]);
                expect(await ids({ missing: { field: 'title', locales: ['fr'] } })).toEqual([
                    'notitle'
                ]);
            });

            it('counts values per facet, each ignoring its own filter', async () => {
                const r = await queryEntriesForProject(projectId, modelId, {
                    filters: { category: ['food'] },
                    facets: ['category', 'author', '$workflow'],
                    missingCounts: { field: 'title', locales: ['fr', 'en'] },
                    limit: 1
                });
                expect(r.total).toBe(2);
                expect(r.items).toHaveLength(1);
                expect(r.facets).toEqual({
                    category: { ocean: 1, food: 2, city: 2 },
                    author: { celeste: 1 },
                    $workflow: { in_review: 1, draft: 1 }
                });
                expect(r.missingCounts).toEqual({ fr: 0, en: 2 });

                const sophie = await queryEntriesForProject(projectId, modelId, {
                    filters: { author: ['sophie'] },
                    missing: { field: 'title', locales: ['en'] },
                    missingCounts: { field: 'title', locales: ['en'] },
                    limit: 0
                });
                expect(sophie.items).toEqual([]);
                expect(sophie.total).toBe(0);
                // missingCounts ignores the missing filter itself.
                expect(sophie.missingCounts).toEqual({ en: 0 });
            });

            it('sorts on a field’s text, ignoring case and accents, empty values last', async () => {
                const byTitle = (direction: 'asc' | 'desc', locale?: string) =>
                    ids({ sort: { field: 'data', key: 'title', locale, direction } });
                expect(await byTitle('asc', 'fr')).toEqual([
                    'eclair',
                    'paris',
                    'sous-la-glace',
                    'zebre',
                    'notitle'
                ]);
                expect(await byTitle('desc', 'fr')).toEqual([
                    'zebre',
                    'sous-la-glace',
                    'paris',
                    'eclair',
                    'notitle'
                ]);
                // An empty translation falls back to the first language that has text.
                expect(await byTitle('asc', 'en')).toEqual([
                    'eclair',
                    'paris',
                    'sous-la-glace',
                    'zebre',
                    'notitle'
                ]);
            });

            it('groups rows in the given order, then by value, entries without a value last', async () => {
                const query = {
                    group: { key: 'category', order: ['food'] },
                    sort: { field: 'updatedAt' as const, direction: 'desc' as const }
                };
                expect(await ids(query)).toEqual([
                    'eclair',
                    'zebre',
                    'paris',
                    'notitle',
                    'sous-la-glace'
                ]);
                expect(await ids({ ...query, limit: 2, offset: 2 })).toEqual(['paris', 'notitle']);
                expect(await ids({ group: { key: 'author' }, sort: query.sort, limit: 3 })).toEqual(
                    ['eclair', 'sous-la-glace', 'paris']
                );
            });

            it('returns only the requested fields', async () => {
                const [first] = (
                    await queryEntriesForProject(projectId, modelId, {
                        filters: { author: ['celeste'] },
                        fields: ['title', 'nope']
                    })
                ).items;
                expect(first.data).toEqual({ title: { fr: 'Éclair au chocolat', en: '' } });
                expect(first.status).toBe('in_review');
                expect(first.meta?.audit?.updatedBy).toBe('u-celeste');
            });

            it('refuses list features on the published view', async () => {
                await expect(
                    queryEntriesForProject(projectId, modelId, {
                        view: 'published',
                        search: 'paris'
                    })
                ).rejects.toThrow();
            });

            it('keeps list facts in step with entry files', async () => {
                const changed = article(
                    'zebre',
                    { title: { fr: 'Zèbre', en: 'Zebra' }, category: 'ocean' },
                    { updatedAt: '2025-01-06T00:00:00Z' }
                );
                await putProjectJson(projectId, entryKey(modelId, 'zebre'), changed);
                (await getContentIndex()).invalidate(projectId);
                expect(await ids({ filters: { category: ['ocean'] } })).toEqual([
                    'sous-la-glace',
                    'zebre'
                ]);
                expect(await ids({ search: 'zebra' })).toEqual(['zebre']);
                expect(await ids({ missing: { field: 'title', locales: ['en'] } })).toEqual([
                    'eclair',
                    'notitle'
                ]);

                // Commits finish in the background: let them before removing the folder.
                await gitIdle();
                await fs.rm(path.join(projDir, entryKey(modelId, 'zebre')));
                (await getContentIndex()).invalidate(projectId);
                const r = await queryEntriesForProject(projectId, modelId, {
                    facets: ['category'],
                    limit: 0
                });
                expect(r.facets).toEqual({ category: { ocean: 1, food: 1, city: 2 } });
            });
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
        // Commits finish in the background: let them before removing the folder.
        await gitIdle();
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
        // Commits finish in the background: let them before removing the folder.
        await gitIdle();
        await fs.rm(`${dbFile()}-wal`, { force: true });
        // Commits finish in the background: let them before removing the folder.
        await gitIdle();
        await fs.rm(`${dbFile()}-shm`, { force: true });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect((await queryEntriesForProject(projectId, modelId)).total).toBe(1);
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('does not serve stale rows when the project directory is replaced', async () => {
        await writeEntryFile(entry('a', 'draft', '2025-01-01T00:00:00Z'));
        expect((await queryEntriesForProject(projectId, modelId)).total).toBe(1);

        // Commits finish in the background: let them before removing the folder.
        await gitIdle();
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
            const first = await addAndCommit(dir, ['a.json'], 'one', user);
            await fs.writeFile(path.join(dir, 'a.json'), '{"v":2}\n');
            await fs.writeFile(path.join(dir, 'b.json'), 'é');
            const second = await addAndCommit(dir, ['a.json', 'b.json'], 'two', user);

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
            // Commits finish in the background: let them before removing the folder.
            await gitIdle();
            await fs.rm(dir, { recursive: true, force: true });
        }
    });
});
