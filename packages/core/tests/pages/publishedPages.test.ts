import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { initRepo } from '../../src/git/index.js';
import { registerContentCommitHook } from '../../src/git/contentCommitHook.js';
import { createTemplate } from '../../src/templates.js';
import { createPage, getNavigation, getPage, resolveAllUrls, updatePage } from '../../src/pages.js';
import { listRedirects } from '../../src/redirects.js';
import { createNavigation, resolveNavigation } from '../../src/navigations.js';
import { hasWaitingChanges, publicPage } from '../../src/pages/publishedPages.js';
import { approveReview, submitForPageReview } from '../../src/reviews.js';
import { pageKey } from '../../src/utils/storageKeys.js';
import { putProjectJson } from '../../src/utils/projectStorage.js';
import type { StaticPage } from '@moteurio/types/Page.js';
import type { User } from '@moteurio/types/User.js';

registerContentCommitHook();

const projectId = 'published-pages';
const admin = {
    id: 'a1',
    name: 'Ada',
    isActive: true,
    roles: ['admin'],
    projects: [projectId]
} as User;
const writer = { ...admin, id: 'w1', name: 'Will', roles: ['writer'] } as User;
const reviewer = { ...admin, id: 'r1', name: 'Rita', roles: ['reviewer'] } as User;

const headline = async (page: unknown) => ((await page) as StaticPage | null)?.fields?.headline;
const live = async (id: string) => headline(publicPage(projectId, await getPage(projectId, id)));

describe('a live page and its changes', () => {
    let tempDir: string;
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-published-pages-'));
        const dir = path.join(tempDir, 'data', 'projects', projectId);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(
            path.join(dir, 'project.json'),
            JSON.stringify({
                id: projectId,
                label: 'P',
                defaultLocale: 'en',
                users: ['a1', 'w1', 'r1'],
                workflow: { enabled: true, mode: 'auto_publish', requireReview: true }
            })
        );
        vi.stubEnv('DATA_ROOT', tempDir);
        await initRepo(dir);
        await createTemplate(projectId, admin, {
            id: 'landing',
            label: 'Landing',
            fields: { headline: { type: 'core/text', label: 'Headline' } }
        } as never);
    });
    afterEach(async () => {
        vi.unstubAllEnvs();
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    const about = () =>
        createPage(projectId, admin, {
            type: 'static',
            label: 'About',
            slug: 'about',
            templateId: 'landing',
            status: 'published',
            fields: { headline: 'One' }
        } as never);

    it('keeps draft pages out of navigation and menus', async () => {
        await about();
        const draft = await createPage(projectId, admin, {
            type: 'static',
            label: 'Secret launch',
            slug: 'launch',
            templateId: 'landing',
            status: 'draft',
            fields: { headline: 'Soon' }
        } as never);

        const tree = await getNavigation(projectId);
        expect(tree.map(n => n.label)).toEqual(['About']);

        const menu = await createNavigation(projectId, admin, {
            name: 'Main',
            handle: 'main',
            items: [{ id: 'i1', label: 'Launch', linkType: 'page', pageId: draft.id }]
        } as never);
        const resolved = await resolveNavigation(projectId, menu);
        expect(resolved.items[0].url).toBeUndefined();
    });

    it("keeps a writer's edits waiting until a review approves them, once", async () => {
        const page = await about();
        expect((page as StaticPage).publishedCommit).toBeTruthy();

        const saved = await updatePage(projectId, writer, page.id, {
            fields: { headline: 'Two' },
            slug: 'about-us'
        } as never);
        expect((saved as StaticPage).status).toBe('published');
        expect(await headline(getPage(projectId, page.id))).toBe('Two');
        expect(await live(page.id)).toBe('One');
        expect((await resolveAllUrls(projectId)).map(u => u.url)).toEqual(['/about']);
        expect(await hasWaitingChanges(projectId, await getPage(projectId, page.id))).toBe(true);

        // Asking to publish is no way around it.
        await updatePage(projectId, writer, page.id, { status: 'published' } as never);
        expect(await live(page.id)).toBe('One');

        // In review, the page stays live as published.
        const review = await submitForPageReview(projectId, writer, page.id);
        expect(await live(page.id)).toBe('One');
        await approveReview(projectId, reviewer, review.id);
        expect(await live(page.id)).toBe('Two');
        expect((await resolveAllUrls(projectId)).map(u => u.url)).toEqual(['/about-us']);
        expect((await listRedirects(projectId)).map(r => [r.from, r.to])).toEqual([
            ['/about', '/about-us']
        ]);

        // That approval is used: the next change waits again.
        await updatePage(projectId, writer, page.id, { fields: { headline: 'Three' } } as never);
        expect(await live(page.id)).toBe('Two');
    });

    it('refuses to approve what changed after it was sent', async () => {
        const page = await about();
        await updatePage(projectId, writer, page.id, { fields: { headline: 'Two' } } as never);
        const review = await submitForPageReview(projectId, writer, page.id);
        await updatePage(projectId, writer, page.id, { fields: { headline: 'Sneaky' } } as never);
        await expect(approveReview(projectId, reviewer, review.id)).rejects.toMatchObject({
            statusCode: 409
        });
        expect(await live(page.id)).toBe('One');
    });

    it('lets someone who can publish change a live page at once', async () => {
        const page = await about();
        await updatePage(projectId, admin, page.id, { fields: { headline: 'Now' } } as never);
        expect(await live(page.id)).toBe('Now');
    });

    it('lets someone who can publish put waiting changes live', async () => {
        const page = await about();
        await updatePage(projectId, writer, page.id, { fields: { headline: 'Two' } } as never);
        await updatePage(projectId, admin, page.id, { status: 'published' } as never);
        expect(await live(page.id)).toBe('Two');
        expect(await hasWaitingChanges(projectId, await getPage(projectId, page.id))).toBe(false);
    });

    it('approves only a complete page', async () => {
        await createTemplate(projectId, admin, {
            id: 'strict',
            label: 'Strict',
            fields: {
                headline: { type: 'core/text', label: 'Headline', options: { required: true } }
            }
        } as never);
        const page = await createPage(projectId, writer, {
            type: 'static',
            label: 'Empty',
            slug: 'empty',
            templateId: 'strict',
            fields: {}
        } as never);
        const review = await submitForPageReview(projectId, writer, page.id);
        await expect(approveReview(projectId, reviewer, review.id)).rejects.toThrow(/headline/i);
        expect(await live(page.id)).toBeUndefined();
    });

    it('pins a live page that has no published version yet (a copied project starts so)', async () => {
        const page = await about();
        const { publishedCommit: _c, publishedAt: _a, ...copied } = page as StaticPage;
        await putProjectJson(projectId, pageKey(page.id), copied);
        await updatePage(projectId, writer, page.id, { fields: { headline: 'Two' } } as never);
        expect(await live(page.id)).toBe('One');

        await putProjectJson(projectId, pageKey(page.id), {
            ...copied,
            fields: { headline: 'One' }
        });
        await submitForPageReview(projectId, writer, page.id);
        expect(await live(page.id)).toBe('One');
    });

    it("refuses changes that would wait on a live page when there's no Git to keep its version", async () => {
        const page = await about();
        const { publishedCommit: _c, publishedAt: _a, ...bare } = page as StaticPage;
        await putProjectJson(projectId, pageKey(page.id), bare);
        await fs.rm(path.join(tempDir, 'data', 'projects', projectId, '.git'), {
            recursive: true,
            force: true
        });
        await expect(
            updatePage(projectId, writer, page.id, { fields: { headline: 'Two' } } as never)
        ).rejects.toThrow(/Git/);
        expect(await headline(getPage(projectId, page.id))).toBe('One');
    });
});
