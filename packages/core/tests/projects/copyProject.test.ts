import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { gitIdle, initRepo } from '../../src/git/index.js';
import { registerContentCommitHook } from '../../src/git/contentCommitHook.js';
import { createTemplate } from '../../src/templates.js';
import { createPage, getPage, updatePage } from '../../src/pages.js';
import { publicPage } from '../../src/pages/publishedPages.js';
import { createModelSchema } from '../../src/models.js';
import {
    createEntry,
    getEntryForProject,
    getPublishedEntryForProject,
    publishEntry,
    updateEntry
} from '../../src/entries.js';
import { copyProjectForNewUser } from '../../src/projects.js';
import { reloadUsers } from '../../src/users.js';
import { getProjectJson, putProjectJson } from '../../src/utils/projectStorage.js';
import type { User } from '@moteurio/types/User.js';

const admin = {
    id: 'a1',
    name: 'Ada',
    email: 'a@x.dev',
    isActive: true,
    roles: ['admin'],
    projects: []
} as User;
const writer = { ...admin, id: 'w1', name: 'Will', roles: ['writer'] } as User;
const source = 'journal';

registerContentCommitHook();

describe('copying a project', () => {
    let tempDir: string;
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-copy-project-'));
        vi.stubEnv('DATA_ROOT', tempDir);
        vi.stubEnv('AUTH_USERS_FILE', path.join(tempDir, 'users.json'));
        await fs.writeFile(
            path.join(tempDir, 'users.json'),
            JSON.stringify([
                { id: 'newcomer', email: 'n@x.dev', isActive: true, roles: [], projects: [] }
            ])
        );
        reloadUsers();
        const dir = path.join(tempDir, 'data', 'projects', source);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(
            path.join(dir, 'project.json'),
            JSON.stringify({
                id: source,
                label: 'Journal',
                defaultLocale: 'en',
                users: ['a1', 'w1'],
                workflow: { enabled: true, mode: 'auto_publish', requireReview: true }
            })
        );
        await initRepo(dir);
        await createTemplate(source, admin, {
            id: 'landing',
            label: 'Landing',
            fields: { headline: { type: 'core/text', label: 'Headline' } }
        } as never);
        await createModelSchema(admin, source, {
            id: 'post',
            label: 'Post',
            fields: { title: { type: 'core/text', label: 'Title' } }
        } as never);
    });
    afterEach(async () => {
        await gitIdle();
        vi.unstubAllEnvs();
        reloadUsers();
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('starts as its source is published, pinned in its own history, under its own name', async () => {
        // In the source: an entry and a page published, then edited without publishing.
        await createEntry(admin, source, 'post', { id: 'hello', data: { title: 'One' } } as never);
        await publishEntry(admin, source, 'post', 'hello');
        await updateEntry(admin, source, 'post', 'hello', { data: { title: 'Draft' } } as never);
        const page = await createPage(source, admin, {
            type: 'static',
            label: 'About',
            slug: 'about',
            templateId: 'landing',
            status: 'published',
            fields: { headline: 'One' }
        } as never);
        await updatePage(source, writer, page.id, { fields: { headline: 'Waiting' } } as never);
        await gitIdle();

        // What the audit plugin counts on a running server: one save since publishing.
        const edited = (await getEntryForProject(source, 'post', 'hello'))!;
        await putProjectJson(source, 'models/post/entries/hello/entry.json', {
            ...edited,
            meta: { ...edited.meta, audit: { ...edited.meta!.audit, revision: 2 } }
        });
        await copyProjectForNewUser(source, 'mine', 'newcomer');
        await gitIdle();
        const copyDir = path.join(tempDir, 'data', 'projects', 'mine');
        const head = spawnSync('git', ['rev-parse', 'HEAD'], {
            cwd: copyDir,
            encoding: 'utf8'
        }).stdout.trim();

        // The published versions, not the edits waiting in the source.
        const entry = await getEntryForProject('mine', 'post', 'hello');
        expect(entry?.data?.title).toBe('One');
        expect(entry?.meta?.audit?.publishedCommit).toBe(head);
        const copied = await getPage('mine', page.id);
        expect((copied as { fields: { headline: string } }).fields.headline).toBe('One');
        expect(copied).toMatchObject({ projectId: 'mine', publishedCommit: head });

        // Edited in the copy, it stays on the site as published (it used to vanish).
        const mine = (await getProjectJson<Record<string, unknown>>('mine', 'project.json'))!;
        await putProjectJson('mine', 'project.json', {
            ...mine,
            users: ['newcomer', 'a1', 'w1'],
            memberRoles: { ...(mine.memberRoles as object), a1: ['admin'], w1: ['writer'] }
        });
        await updateEntry(admin, 'mine', 'post', 'hello', { data: { title: 'Mine' } } as never);
        const saved = (await getEntryForProject('mine', 'post', 'hello'))!;
        await putProjectJson('mine', 'models/post/entries/hello/entry.json', {
            ...saved,
            meta: {
                ...saved.meta,
                audit: { ...saved.meta!.audit, revision: saved.meta!.audit!.publishedRevision! + 1 }
            }
        });
        expect((await getPublishedEntryForProject('mine', 'post', 'hello'))?.data?.title).toBe(
            'One'
        );
        await updatePage('mine', writer, page.id, { fields: { headline: 'Mine' } } as never);
        expect(
            (
                (await publicPage('mine', await getPage('mine', page.id))) as {
                    fields: { headline: string };
                }
            )?.fields.headline
        ).toBe('One');
    });
});
