import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { gitIdle, initRepo } from '../src/git/index.js';
import { registerContentCommitHook } from '../src/git/contentCommitHook.js';
import { createModelSchema } from '../src/models.js';
import { createTemplate } from '../src/templates.js';
import {
    createEntry,
    deleteEntry,
    getEntryForProject,
    getPublishedEntryForProject,
    publishEntry
} from '../src/entries.js';
import { createPage, deletePage, getPage } from '../src/pages.js';
import {
    deleteFromContentBin,
    emptyContentBin,
    listContentBin,
    restoreFromContentBin
} from '../src/contentBinService.js';
import type { User } from '@moteurio/types/User.js';

const admin = { id: 'a1', name: 'Ada', email: 'a@x.dev', isActive: true, roles: ['admin'] } as User;
const writer = { ...admin, id: 'w1', name: 'Will', roles: ['writer'] } as User;
const agent = { ...writer, id: 'bot', agent: { name: 'Helper', reviewOnly: true } } as User;
const projectId = 'site';

registerContentCommitHook();

describe('the bin for entries and pages', () => {
    let tempDir: string;
    let dir: string;
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-bin-'));
        vi.stubEnv('DATA_ROOT', tempDir);
        dir = path.join(tempDir, 'data', 'projects', projectId);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(
            path.join(dir, 'project.json'),
            JSON.stringify({
                id: projectId,
                label: 'Site',
                defaultLocale: 'en',
                users: ['a1', 'w1', 'bot']
            })
        );
        await initRepo(dir);
        await createModelSchema(admin, projectId, {
            id: 'post',
            label: 'Post',
            fields: { title: { type: 'core/text', label: 'Title' } }
        } as never);
        await createTemplate(projectId, admin, {
            id: 'plain',
            label: 'Plain',
            fields: { headline: { type: 'core/text', label: 'Headline' } }
        } as never);
    });
    afterEach(async () => {
        await gitIdle();
        vi.unstubAllEnvs();
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('keeps a deleted entry, with who and when, and gives it back as a draft, off the site', async () => {
        await createEntry(admin, projectId, 'post', {
            id: 'hello',
            data: { title: 'Hello' }
        } as never);
        await publishEntry(admin, projectId, 'post', 'hello');
        await deleteEntry(writer, projectId, 'post', 'hello');
        expect(await getEntryForProject(projectId, 'post', 'hello')).toBeNull();

        const [item] = await listContentBin(projectId, writer);
        expect(item).toMatchObject({
            kind: 'entry',
            modelId: 'post',
            binned: { by: 'w1', byName: 'Will' },
            entry: { id: 'hello', data: { title: 'Hello' }, status: 'published' }
        });

        const back = await restoreFromContentBin(projectId, writer, item.id);
        expect(back).toMatchObject({ kind: 'entry', entry: { status: 'unpublished' } });
        expect((await getEntryForProject(projectId, 'post', 'hello'))?.data?.title).toBe('Hello');
        // Taking it out doesn't put it live: that's publishing's job, with its review.
        expect((await getPublishedEntryForProject(projectId, 'post', 'hello'))?.status).toBe(
            'unpublished'
        );
        expect(await listContentBin(projectId, writer)).toEqual([]);
        await gitIdle();
        const log = spawnSync('git', ['log', '--format=%s'], { cwd: dir, encoding: 'utf8' }).stdout;
        expect(log).toMatch(/^Restore post\/hello from the bin — Will/m);
    });

    it('keeps each deletion of the same id, and refuses one whose id is taken again', async () => {
        for (const title of ['First', 'Second']) {
            await createEntry(admin, projectId, 'post', { id: 'twice', data: { title } } as never);
            await deleteEntry(admin, projectId, 'post', 'twice');
        }
        const items = await listContentBin(projectId, admin);
        expect(items.map(i => (i.kind === 'entry' ? i.entry.data?.title : ''))).toEqual(
            expect.arrayContaining(['First', 'Second'])
        );
        await createEntry(admin, projectId, 'post', {
            id: 'twice',
            data: { title: 'Third' }
        } as never);
        await expect(restoreFromContentBin(projectId, admin, items[0].id)).rejects.toMatchObject({
            statusCode: 409
        });
    });

    it('gives a page back as a draft, at the top when its parent is gone, and not over another address', async () => {
        const parent = await createPage(projectId, admin, {
            type: 'static',
            label: 'About',
            slug: 'about',
            templateId: 'plain',
            status: 'draft',
            fields: {}
        } as never);
        const child = await createPage(projectId, admin, {
            type: 'static',
            label: 'Team',
            slug: 'team',
            parentId: parent.id,
            templateId: 'plain',
            status: 'published',
            fields: { headline: 'Us' }
        } as never);
        await deletePage(projectId, writer, child.id);
        await deletePage(projectId, writer, parent.id);
        const items = await listContentBin(projectId, writer);
        expect(items.map(i => i.kind)).toEqual(['page', 'page']);
        const teamItem = items.find(i => i.kind === 'page' && i.page.id === child.id)!;

        // Its address taken at the top level meanwhile.
        const other = await createPage(projectId, admin, {
            type: 'static',
            label: 'Team again',
            slug: 'team',
            templateId: 'plain',
            status: 'draft',
            fields: {}
        } as never);
        await expect(restoreFromContentBin(projectId, writer, teamItem.id)).rejects.toMatchObject({
            statusCode: 409
        });
        await deletePage(projectId, admin, other.id);

        const back = await restoreFromContentBin(projectId, writer, teamItem.id);
        expect(back).toMatchObject({ kind: 'page', page: { parentId: null, status: 'draft' } });
        expect((await getPage(projectId, child.id)) as { fields: object }).toMatchObject({
            fields: { headline: 'Us' }
        });
    });

    it('lets writers take things out, admins delete for good, and no review-only agent restore', async () => {
        await createEntry(admin, projectId, 'post', { id: 'a', data: { title: 'A' } } as never);
        await createEntry(admin, projectId, 'post', { id: 'b', data: { title: 'B' } } as never);
        await deleteEntry(admin, projectId, 'post', 'a');
        await deleteEntry(admin, projectId, 'post', 'b');
        const [first, second] = await listContentBin(projectId, writer);

        await expect(restoreFromContentBin(projectId, agent, first.id)).rejects.toMatchObject({
            statusCode: 403
        });
        await expect(deleteFromContentBin(projectId, writer, first.id)).rejects.toMatchObject({
            statusCode: 403
        });
        await expect(emptyContentBin(projectId, writer)).rejects.toMatchObject({ statusCode: 403 });

        await deleteFromContentBin(projectId, admin, first.id);
        expect((await listContentBin(projectId, admin)).map(i => i.id)).toEqual([second.id]);
        expect(await emptyContentBin(projectId, admin)).toBe(1);
        expect(await listContentBin(projectId, admin)).toEqual([]);
        await expect(restoreFromContentBin(projectId, admin, second.id)).rejects.toMatchObject({
            statusCode: 404
        });
        await expect(restoreFromContentBin(projectId, admin, '../../etc')).rejects.toMatchObject({
            statusCode: 404
        });
    });
});
