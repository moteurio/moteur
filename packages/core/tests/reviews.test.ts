import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import type { Entry } from '@moteurio/types/Model.js';
import type { User } from '@moteurio/types/User.js';
import { initRepo, addAndCommit, getRepoLog } from '../src/git/gitService.js';
import { getProjectJson, putProjectJson } from '../src/utils/projectStorage.js';
import { entryKey, modelKey } from '../src/utils/storageKeys.js';
import {
    createEntry,
    getPublishedEntryForProject,
    publishEntry,
    updateEntry
} from '../src/entries.js';
import { approveReview, submitForReview } from '../src/reviews.js';
import { actingUser } from '../src/auth.js';
import { onEvent } from '../src/utils/eventBus.js';
import auditPlugin from '../src/plugins/core/auditLogger.js';
import { registerContentCommitHook } from '../src/git/contentCommitHook.js';
import type { PluginContext } from '../src/plugins/pluginContext.js';

// As in the server: revisions bumped by the audit plugin, saves committed by the hook.
auditPlugin.init({ onEvent } as unknown as PluginContext);
registerContentCommitHook();

const projectId = 'review-test';
const admin: User = {
    id: 'admin',
    name: 'Ada',
    email: 'ada@test.dev',
    isActive: true,
    roles: ['admin'],
    projects: [projectId]
};
const editor: User = { ...admin, id: 'editor', name: 'Eddie', roles: [] };
const reviewer: User = { ...admin, id: 'reviewer', name: 'Rita', roles: ['reviewer'] };

describe('review workflow', () => {
    let tempDir: string;
    let projDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-review-test-'));
        projDir = path.join(tempDir, 'data', 'projects', projectId);
        await fs.mkdir(projDir, { recursive: true });
        vi.stubEnv('DATA_ROOT', tempDir);
        await fs.writeFile(path.join(tempDir, 'data', 'users.json'), '[]');
        await fs.writeFile(
            path.join(projDir, 'project.json'),
            JSON.stringify({
                id: projectId,
                label: 'Reviews',
                defaultLocale: 'en',
                users: ['admin', 'editor', 'reviewer'],
                workflow: { enabled: true, mode: 'auto_publish', requireReview: true }
            })
        );
        await initRepo(projDir);
        await putProjectJson(projectId, modelKey('article'), {
            id: 'article',
            label: 'Article',
            fields: { title: { type: 'core/text' } }
        });
        const entry: Entry = { id: 'e1', type: 'article', status: 'draft', data: { title: 'v1' } };
        await putProjectJson(projectId, entryKey('article', 'e1'), entry);
        addAndCommit(projDir, ['.'], 'seed', admin);
    });

    afterEach(async () => {
        vi.unstubAllEnvs();
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    const commitMessages = () => getRepoLog(projDir).map(c => c.message);

    it('a writer cannot create an entry already published; an admin publishes it for real', async () => {
        const live: Entry = {
            id: 'e2',
            type: 'article',
            status: 'published',
            data: { title: 'x' }
        };
        await expect(createEntry(editor, projectId, 'article', live)).rejects.toMatchObject({
            statusCode: 403
        });
        const agent: User = { ...admin, agent: { name: 'Claude', reviewOnly: true } } as User;
        await expect(
            createEntry(agent, projectId, 'article', { ...live, id: 'e3' })
        ).rejects.toMatchObject({ statusCode: 403 });
        expect(await getProjectJson(projectId, entryKey('article', 'e2'))).toBeNull();

        const made = await createEntry(admin, projectId, 'article', { ...live, id: 'e4' });
        expect(made.status).toBe('published');
        expect((await getPublishedEntryForProject(projectId, 'article', 'e4'))?.data?.title).toBe(
            'x'
        );
    });

    it('approving publishes the reviewed version, so the public API serves it', async () => {
        await publishEntry(admin, projectId, 'article', 'e1');
        await updateEntry(editor, projectId, 'article', 'e1', { data: { title: 'v2' } });
        expect((await getPublishedEntryForProject(projectId, 'article', 'e1'))?.data?.title).toBe(
            'v1'
        );

        const review = await submitForReview(projectId, editor, 'article', 'e1');
        await approveReview(projectId, reviewer, review.id);

        const entry = await getProjectJson<Entry>(projectId, entryKey('article', 'e1'));
        expect(entry?.status).toBe('published');
        expect(entry?.meta?.audit?.publishedCommit).toBe(
            getRepoLog(projDir).find(c => c.message.startsWith('Publish article/e1 — Rita'))?.hash
        );
        expect((await getPublishedEntryForProject(projectId, 'article', 'e1'))?.data?.title).toBe(
            'v2'
        );
    });

    it('an agent’s changes are marked, and go live only once a person approves them', async () => {
        const claude = actingUser(admin, { agent: { name: 'Claude' } });
        expect(claude.name).toBe('Ada via Claude');
        await updateEntry(claude, projectId, 'article', 'e1', {
            data: { title: 'v2' },
            meta: { assisted: { title: { helper: 'agent', read: true } } }
        });
        const saved = await getProjectJson<Entry>(projectId, entryKey('article', 'e1'));
        // Marked as the agent's, unread: the agent can't say it has read its own text.
        expect(saved?.meta?.assisted?.title).toMatchObject({
            helper: 'agent',
            action: 'Claude',
            keptBy: 'admin'
        });
        expect(saved?.meta?.assisted?.title?.readBy).toBeUndefined();
        expect(commitMessages()[0]).toMatch(/^Update article\/e1 \(with help\) — Ada via Claude/);

        // Admin as a person may publish; as a review-only agent, not without approval.
        await expect(publishEntry(claude, projectId, 'article', 'e1')).rejects.toThrow(
            /once a person approves/
        );
        const review = await submitForReview(projectId, claude, 'article', 'e1');
        await expect(approveReview(projectId, claude, review.id)).rejects.toThrow(/a person does/);
        await approveReview(projectId, reviewer, review.id);
        expect((await getPublishedEntryForProject(projectId, 'article', 'e1'))?.data?.title).toBe(
            'v2'
        );
    });

    it('an agent the person lets publish is marked, but not held for review beyond the project’s rules', async () => {
        const claude = actingUser(admin, { agent: { name: 'Claude', reviewOnly: false } });
        await updateEntry(claude, projectId, 'article', 'e1', { data: { title: 'v2' } });
        await publishEntry(claude, projectId, 'article', 'e1');
        expect((await getPublishedEntryForProject(projectId, 'article', 'e1'))?.data?.title).toBe(
            'v2'
        );
    });

    it('commits review status changes despite listing gitignored workspace files', async () => {
        await submitForReview(projectId, editor, 'article', 'e1');
        await vi.waitFor(() =>
            expect(commitMessages()).toContain('Submit for review article/e1 — Eddie')
        );
        const committed = JSON.parse(
            (await import('child_process'))
                .execFileSync('git', ['show', `HEAD:${entryKey('article', 'e1')}`], {
                    cwd: projDir
                })
                .toString()
        ) as Entry;
        expect(committed.status).toBe('in_review');
    });
});
