import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getPublishedEntryForProject } from '../../src/entries.js';
import { putProjectJson } from '../../src/utils/projectStorage.js';
import { entryKey } from '../../src/utils/storageKeys.js';
import { getContentIndex, resetContentIndex } from '../../src/contentIndex/index.js';

for (const adapter of ['files', 'sqlite'])
    describe(`published isolation (${adapter})`, () => {
        let root: string;
        beforeEach(async () => {
            root = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-public-isolation-'));
            vi.stubEnv('DATA_ROOT', root);
            vi.stubEnv('MOTEUR_CONTENT_INDEX', adapter);
            await resetContentIndex();
            await putProjectJson('p1', 'project.json', { id: 'p1', users: [] });
            await putProjectJson('p1', 'models/articles/model.json', {
                id: 'articles',
                fields: {}
            });
            await putProjectJson('p1', entryKey('articles', 'e1'), {
                id: 'e1',
                type: 'articles',
                status: 'published',
                data: { title: 'PRIVATE EDIT' },
                meta: {
                    audit: { revision: 2, publishedRevision: 1, publishedCommit: 'a'.repeat(40) }
                }
            });
        });
        afterEach(async () => {
            await resetContentIndex();
            vi.unstubAllEnvs();
            await fs.rm(root, { recursive: true, force: true });
        });
        it('hides unrecoverable published versions in lists, even without a status filter', async () => {
            const index = await getContentIndex();
            expect(index.kind).toBe(adapter);
            expect(await index.queryEntries('p1', 'articles', { view: 'published' })).toEqual({
                items: [],
                total: 0
            });
            expect(
                (await index.queryEntries('p1', 'articles', { view: 'latest' })).items[0].data
                    ?.title
            ).toBe('PRIVATE EDIT');
        });
        it('never returns the draft through a single-entry public lookup', async () => {
            expect(await getPublishedEntryForProject('p1', 'articles', 'e1')).toBeNull();
        });
        it('also hides newer edits if the published commit pointer itself is missing', async () => {
            await putProjectJson('p1', entryKey('articles', 'e1'), {
                id: 'e1',
                type: 'articles',
                status: 'published',
                data: { title: 'PRIVATE EDIT' },
                meta: { audit: { revision: 2, publishedRevision: 1 } }
            });
            expect(await getPublishedEntryForProject('p1', 'articles', 'e1')).toBeNull();
            expect(
                (
                    await (
                        await getContentIndex()
                    ).queryEntries('p1', 'articles', { view: 'published' })
                ).items
            ).toEqual([]);
        });
    });
