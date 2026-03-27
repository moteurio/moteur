import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { initRepo, getLog } from '../../src/git/index.js';
import { getProjectJson, putProjectJson } from '../../src/utils/projectStorage.js';
import { entryKey, modelKey } from '../../src/utils/storageKeys.js';
import {
    publishEntry,
    getEntryRevisions,
    getPublishedEntryForProject,
    listPublishedEntriesForProject
} from '../../src/entries.js';
import * as publishedCache from '../../src/git/publishedContentCache.js';
import type { Entry } from '@moteurio/types/Model.js';

const projectId = 'pub-test-proj';
const modelId = 'articles';
const entryId = 'post-1';
const testUser = {
    id: 'u1',
    name: 'Alice',
    email: 'alice@test.com',
    isActive: true,
    projects: [projectId]
};

function makeEntry(overrides: Partial<Entry> = {}): Entry {
    return {
        id: entryId,
        type: modelId,
        status: 'draft',
        data: { title: 'Hello World', slug: 'hello-world' },
        meta: {
            audit: {
                createdAt: '2025-01-01T00:00:00Z',
                updatedAt: '2025-01-01T00:00:00Z',
                createdBy: 'u1',
                updatedBy: 'u1',
                revision: 1
            }
        },
        ...overrides
    };
}

describe('publish & revisions (git integration)', () => {
    let tempDir: string;
    let projDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-publish-test-'));
        projDir = path.join(tempDir, 'data', 'projects', projectId);
        await fs.mkdir(projDir, { recursive: true });

        vi.stubEnv('DATA_ROOT', tempDir);

        await fs.writeFile(
            path.join(projDir, 'project.json'),
            JSON.stringify({
                id: projectId,
                label: 'Test Project',
                defaultLocale: 'en',
                users: [testUser.id]
            }),
            'utf-8'
        );

        await initRepo(projDir);

        await putProjectJson(projectId, modelKey(modelId), {
            id: modelId,
            label: 'Articles',
            fields: []
        });

        publishedCache.clear();
    });

    afterEach(async () => {
        vi.unstubAllEnvs();
        publishedCache.clear();
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    });

    async function seedEntry(entry: Entry): Promise<void> {
        await putProjectJson(projectId, entryKey(modelId, entryId), entry);
        const { addAndCommit } = await import('../../src/git/gitService.js');
        addAndCommit(projDir, [entryKey(modelId, entryId)], 'Seed entry', testUser);
    }

    describe('publishEntry', () => {
        it('sets status to published and records publishedCommit', async () => {
            const entry = makeEntry({ status: 'draft' });
            await seedEntry(entry);

            const result = await publishEntry(testUser, projectId, modelId, entryId);

            expect(result.status).toBe('published');
            expect(result.meta?.audit?.publishedRevision).toBeTypeOf('number');
            expect(result.meta?.audit?.publishedCommit).toBeTypeOf('string');
            expect(result.meta?.audit?.publishedCommit?.length).toBe(40);
            expect(result.meta?.audit?.publishedAt).toBeTypeOf('string');
        });

        it('pre-warms the published content cache', async () => {
            await seedEntry(makeEntry());

            expect(publishedCache.size()).toBe(0);
            const result = await publishEntry(testUser, projectId, modelId, entryId);
            expect(publishedCache.size()).toBe(1);

            const commitHash = result.meta!.audit!.publishedCommit!;
            const cached = publishedCache.get(commitHash, entryKey(modelId, entryId));
            expect(cached).toBeTypeOf('string');
            const parsed = JSON.parse(cached!);
            expect(parsed.status).toBe('published');
        });

        it('creates two git commits (content + pointer)', async () => {
            await seedEntry(makeEntry());

            await publishEntry(testUser, projectId, modelId, entryId);

            const log = getLog(projDir, entryKey(modelId, entryId), 10);
            expect(log.length).toBeGreaterThanOrEqual(3);
            expect(log[0].message).toMatch(/publishedCommit/i);
            expect(log[1].message).toMatch(/Publish/);
        });
    });

    describe('getPublishedEntryForProject', () => {
        it('returns entry.json when revision == publishedRevision', async () => {
            const entry = makeEntry({ status: 'published' });
            entry.meta!.audit!.publishedRevision = 1;
            entry.meta!.audit!.publishedCommit = 'abc123';
            await putProjectJson(projectId, entryKey(modelId, entryId), entry);

            const result = await getPublishedEntryForProject(projectId, modelId, entryId);
            expect(result).not.toBeNull();
            expect(result!.data?.title).toBe('Hello World');
        });

        it('returns frozen content from git when revision > publishedRevision', async () => {
            await seedEntry(makeEntry());

            await publishEntry(testUser, projectId, modelId, entryId);

            const draft = await getProjectJson<Entry>(projectId, entryKey(modelId, entryId));
            draft!.data!.title = 'Draft Title';
            draft!.meta!.audit!.revision = 99;
            await putProjectJson(projectId, entryKey(modelId, entryId), draft!);

            const result = await getPublishedEntryForProject(projectId, modelId, entryId);
            expect(result).not.toBeNull();
            expect(result!.data?.title).toBe('Hello World');
            expect(result!.data?.title).not.toBe('Draft Title');
        });

        it('serves from cache on second call (no git show needed)', async () => {
            await seedEntry(makeEntry());
            await publishEntry(testUser, projectId, modelId, entryId);

            const draft = await getProjectJson<Entry>(projectId, entryKey(modelId, entryId));
            draft!.data!.title = 'Draft V2';
            draft!.meta!.audit!.revision = 50;
            await putProjectJson(projectId, entryKey(modelId, entryId), draft!);

            publishedCache.clear();
            expect(publishedCache.size()).toBe(0);

            // First call — cache miss, calls git show
            await getPublishedEntryForProject(projectId, modelId, entryId);
            expect(publishedCache.size()).toBe(1);

            // Second call — cache hit
            const result = await getPublishedEntryForProject(projectId, modelId, entryId);
            expect(result!.data?.title).toBe('Hello World');
            expect(publishedCache.size()).toBe(1);
        });

        it('returns null for non-existent entry', async () => {
            const result = await getPublishedEntryForProject(projectId, modelId, 'nope');
            expect(result).toBeNull();
        });
    });

    describe('listPublishedEntriesForProject', () => {
        it('only returns entries with status published', async () => {
            const pub = makeEntry({ status: 'published' });
            pub.meta!.audit!.publishedRevision = 1;
            await putProjectJson(projectId, entryKey(modelId, entryId), pub);

            const draftEntry: Entry = {
                id: 'post-2',
                type: modelId,
                status: 'draft',
                data: { title: 'Draft' }
            };
            await putProjectJson(projectId, entryKey(modelId, 'post-2'), draftEntry);

            const results = await listPublishedEntriesForProject(projectId, modelId);
            expect(results.length).toBe(1);
            expect(results[0].id).toBe(entryId);
        });
    });

    describe('getEntryRevisions', () => {
        it('returns revision history from git log', async () => {
            await seedEntry(makeEntry());

            const entry = await getProjectJson<Entry>(projectId, entryKey(modelId, entryId));
            entry!.data!.title = 'V2';
            await putProjectJson(projectId, entryKey(modelId, entryId), entry!);
            const { addAndCommit } = await import('../../src/git/gitService.js');
            addAndCommit(projDir, [entryKey(modelId, entryId)], 'Update to V2', testUser);

            const revisions = getEntryRevisions(projectId, modelId, entryId);

            expect(revisions.length).toBeGreaterThanOrEqual(2);
            expect(revisions[0].number).toBeGreaterThan(revisions[1].number);
            expect(revisions[0].id).toHaveLength(40);
            expect(revisions[0].savedBy).toBeTruthy();
        });

        it('returns empty array when no git repo', async () => {
            const noGitDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-nogit-'));
            const noGitProjDir = path.join(noGitDir, 'data', 'projects', 'no-git');
            await fs.mkdir(noGitProjDir, { recursive: true });
            vi.stubEnv('DATA_ROOT', noGitDir);
            try {
                const revisions = getEntryRevisions('no-git', 'model', 'entry');
                expect(revisions).toEqual([]);
            } finally {
                await fs.rm(noGitDir, { recursive: true, force: true }).catch(() => {});
            }
        });

        it('respects maxCount', async () => {
            await seedEntry(makeEntry());

            for (let i = 2; i <= 5; i++) {
                const entry = await getProjectJson<Entry>(projectId, entryKey(modelId, entryId));
                entry!.data!.title = `V${i}`;
                await putProjectJson(projectId, entryKey(modelId, entryId), entry!);
                const { addAndCommit } = await import('../../src/git/gitService.js');
                addAndCommit(projDir, [entryKey(modelId, entryId)], `Update to V${i}`, testUser);
            }

            const all = getEntryRevisions(projectId, modelId, entryId);
            expect(all.length).toBeGreaterThanOrEqual(5);

            const limited = getEntryRevisions(projectId, modelId, entryId, 2);
            expect(limited.length).toBe(2);
        });
    });
});
