import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { initRepo } from '../../src/git/index.js';
import { registerContentCommitHook } from '../../src/git/contentCommitHook.js';
import { getFileRevisions } from '../../src/fileRevisions.js';
import { createTemplate } from '../../src/templates.js';
import { createPage, restorePageAtRevision, updatePage } from '../../src/pages.js';
import { createLayout, restoreLayoutAtRevision, updateLayout } from '../../src/layouts.js';
import { layoutKey, pageKey } from '../../src/utils/storageKeys.js';
import type { StaticPage } from '@moteurio/types/Page.js';
import type { User } from '@moteurio/types/User.js';

registerContentCommitHook();

const projectId = 'restore-pages';
const user = {
    id: 'u1',
    name: 'Ada',
    isActive: true,
    roles: ['admin'],
    projects: [projectId]
} as User;

/** Saves are committed by a hook; wait until the history has `count` of them. */
async function history(key: string, count: number) {
    await vi.waitFor(async () =>
        expect(await getFileRevisions(projectId, key)).toHaveLength(count)
    );
    return await getFileRevisions(projectId, key);
}

describe('restoring pages and layouts', () => {
    let tempDir: string;
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-restore-pages-'));
        const dir = path.join(tempDir, 'data', 'projects', projectId);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(
            path.join(dir, 'project.json'),
            JSON.stringify({ id: projectId, label: 'P', defaultLocale: 'en', users: ['u1'] })
        );
        vi.stubEnv('DATA_ROOT', tempDir);
        await initRepo(dir);
        await createTemplate(projectId, user, {
            id: 'landing',
            label: 'Landing',
            fields: {
                headline: { type: 'core/text', label: 'Headline' },
                intro: { type: 'core/textarea', label: 'Intro' }
            }
        } as never);
    });
    afterEach(async () => {
        vi.unstubAllEnvs();
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('puts a page’s content back as a new save, keeping its address and status', async () => {
        const page = (await createPage(projectId, user, {
            type: 'static',
            label: 'About',
            slug: 'about',
            templateId: 'landing',
            fields: { headline: 'First' }
        } as never)) as StaticPage;
        const [first] = await history(pageKey(page.id), 1);
        await updatePage(projectId, user, page.id, {
            label: 'About us',
            slug: 'about-us',
            fields: { headline: 'Second', intro: 'Added later' },
            status: 'published'
        } as never);
        await history(pageKey(page.id), 2);

        const { restored: r, changed } = await restorePageAtRevision(
            projectId,
            user,
            page.id,
            first.id
        );
        const restored = r as StaticPage;
        expect(changed).toBe(true);

        expect(restored.label).toBe('About');
        expect(restored.fields).toEqual({ headline: 'First' });
        expect(restored.slug).toBe('about-us');
        expect(restored.status).toBe('published');
        const saves = await history(pageKey(page.id), 3);
        expect(saves[0].message).toBe(`Restore page ${page.id} from ${first.id.slice(0, 7)} — Ada`);
    });

    it('puts a layout back as a new save', async () => {
        await createLayout(user, projectId, {
            id: 'footer',
            label: 'Footer',
            blocks: []
        } as never);
        const [first] = await history(layoutKey('footer'), 1);
        await updateLayout(user, projectId, 'footer', {
            label: 'Site footer',
            description: 'Added later'
        });
        await history(layoutKey('footer'), 2);

        const { restored } = await restoreLayoutAtRevision(user, projectId, 'footer', first.id);

        expect(restored.label).toBe('Footer');
        expect(restored.description).toBeUndefined();
        const saves = await history(layoutKey('footer'), 3);
        expect(saves[0].message).toMatch(/^Restore layout footer from /);
    });

    it('lets no reader restore a layout', async () => {
        await createLayout(user, projectId, { id: 'footer', label: 'Footer', blocks: [] } as never);
        const [first] = await history(layoutKey('footer'), 1);
        const reader = { ...user, roles: ['viewer'] } as User;
        await expect(
            restoreLayoutAtRevision(reader, projectId, 'footer', first.id)
        ).rejects.toThrow();
    });

    it('saves nothing when the page already matches that version', async () => {
        const page = await createPage(projectId, user, {
            type: 'static',
            label: 'About',
            slug: 'about',
            templateId: 'landing',
            fields: { headline: 'Same' }
        } as never);
        const [first] = await history(pageKey(page.id), 1);
        // Only the status changes since: a restore keeps it, so there is nothing to put back.
        await updatePage(projectId, user, page.id, { status: 'published' } as never);
        await history(pageKey(page.id), 2);
        const { changed } = await restorePageAtRevision(projectId, user, page.id, first.id);
        expect(changed).toBe(false);
        await new Promise(r => setTimeout(r, 100));
        expect(await getFileRevisions(projectId, pageKey(page.id))).toHaveLength(2);
    });

    it('skips a save that changes nothing', async () => {
        const page = await createPage(projectId, user, {
            type: 'static',
            label: 'About',
            slug: 'about',
            templateId: 'landing',
            fields: { headline: 'Same' }
        } as never);
        await history(pageKey(page.id), 1);
        await updatePage(projectId, user, page.id, {
            fields: { headline: 'Same' },
            updatedAt: new Date().toISOString()
        } as never);
        await new Promise(r => setTimeout(r, 100));
        expect(await getFileRevisions(projectId, pageKey(page.id))).toHaveLength(1);
    });
});
