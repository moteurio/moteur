import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { Entry } from '@moteurio/types/Model.js';
import type { User } from '@moteurio/types/User.js';
import { initRepo } from '../../src/git/index.js';
import { registerContentCommitHook } from '../../src/git/contentCommitHook.js';
import auditPlugin from '../../src/plugins/core/auditLogger.js';
import type { PluginContext } from '../../src/plugins/pluginContext.js';
import { onEvent } from '../../src/utils/eventBus.js';
import { putProjectJson } from '../../src/utils/projectStorage.js';
import { entryKey, modelKey } from '../../src/utils/storageKeys.js';
import { createTemplate } from '../../src/templates.js';
import { publishEntry, updateEntry } from '../../src/entries.js';
import {
    createPage,
    getPageBySlug,
    reorderPages,
    resolveAllUrls,
    resolveEntryUrl,
    resolvePath,
    updatePage
} from '../../src/pages.js';
import {
    createRedirect,
    deleteRedirect,
    listRedirects,
    registerRedirectHooks,
    updateRedirect
} from '../../src/redirects.js';

// As in the server: revisions bumped by the audit plugin, saves committed, moves redirected.
auditPlugin.init({ onEvent } as unknown as PluginContext);
registerContentCommitHook();
registerRedirectHooks();

const projectId = 'addresses';
const user: User = {
    id: 'u1',
    name: 'Ada',
    email: 'ada@test.dev',
    isActive: true,
    roles: ['admin'],
    projects: [projectId]
};

let tempDir: string;
let projDir: string;

async function writeProject(extra: Record<string, unknown> = {}): Promise<void> {
    await fs.writeFile(
        path.join(projDir, 'project.json'),
        JSON.stringify({
            id: projectId,
            label: 'Addresses',
            defaultLocale: 'en',
            supportedLocales: ['fr'],
            users: ['u1'],
            ...extra
        })
    );
}

const page = (data: Record<string, unknown>) =>
    createPage(projectId, user, {
        type: 'static',
        templateId: 'basic',
        status: 'published',
        fields: {},
        ...data
    } as never);

const blog = () =>
    createPage(projectId, user, {
        type: 'collection',
        label: 'Blog',
        slug: 'blog',
        slugs: { fr: 'blogue' },
        templateId: 'basic',
        status: 'published',
        fields: {},
        modelId: 'article',
        urlPattern: '[slug]'
    } as never);

const byUrl = async () => new Map((await resolveAllUrls(projectId)).map(u => [u.url, u]));

describe('page addresses in every language', () => {
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-addresses-'));
        projDir = path.join(tempDir, 'data', 'projects', projectId);
        await fs.mkdir(projDir, { recursive: true });
        await fs.writeFile(path.join(tempDir, 'data', 'users.json'), '[]');
        vi.stubEnv('DATA_ROOT', tempDir);
        await writeProject();
        await initRepo(projDir);
        await createTemplate(projectId, user, {
            id: 'basic',
            label: 'Basic',
            fields: { headline: { type: 'core/text', label: 'Headline' } }
        } as never);
        await putProjectJson(projectId, modelKey('article'), {
            id: 'article',
            label: 'Article',
            fields: { title: { type: 'core/text' }, slug: { type: 'core/text' } }
        });
        const entry: Entry = {
            id: 'factory',
            type: 'article',
            status: 'draft',
            data: {
                title: { en: 'The Factory', fr: "L'usine" },
                slug: { en: 'the-factory', fr: 'l-usine' }
            }
        };
        await putProjectJson(projectId, entryKey('article', 'factory'), entry);
        await publishEntry(user, projectId, 'article', 'factory');
    });
    afterEach(async () => {
        vi.unstubAllEnvs();
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('gives a page and its entries an address per language, each knowing the others', async () => {
        await page({ label: 'About', slug: 'about', slugs: { fr: 'a-propos' } });
        await blog();

        const urls = await byUrl();
        expect([...urls.keys()].sort()).toEqual([
            '/about',
            '/blog',
            '/blog/the-factory',
            '/fr/a-propos',
            '/fr/blogue',
            '/fr/blogue/l-usine'
        ]);
        expect(urls.get('/fr/blogue/l-usine')).toMatchObject({
            locale: 'fr',
            entryId: 'factory',
            alternates: { en: '/blog/the-factory', fr: '/fr/blogue/l-usine' }
        });
        expect(await resolveEntryUrl(projectId, 'factory', 'article', 'fr')).toBe(
            '/fr/blogue/l-usine'
        );
        expect((await getPageBySlug(projectId, 'a-propos', 'fr'))?.label).toBe('About');
        expect(await getPageBySlug(projectId, 'a-propos', 'en')).toBeNull();
    });

    it('prefixes every language, or none, as the project asks', async () => {
        await page({ label: 'About', slug: 'about', slugs: { fr: 'a-propos' } });
        await page({ label: 'Contact', slug: 'contact' });

        await writeProject({ localePrefix: 'all' });
        expect([...(await byUrl()).keys()].sort()).toEqual([
            '/en/about',
            '/en/contact',
            '/fr/a-propos',
            '/fr/contact'
        ]);

        // Without prefixes, a page with one slug for both languages has one address.
        await writeProject({ localePrefix: 'none' });
        const urls = await byUrl();
        expect([...urls.keys()].sort()).toEqual(['/a-propos', '/about', '/contact']);
        expect(urls.get('/contact')?.alternates).toEqual({ en: '/contact' });
    });

    it('refuses a slug for the default language, an unknown one, or one a sibling has', async () => {
        await page({ label: 'About', slug: 'about', slugs: { fr: 'a-propos' } });
        await expect(page({ label: 'X', slug: 'x', slugs: { en: 'y' } })).rejects.toThrow(
            'default language'
        );
        await expect(page({ label: 'X', slug: 'x', slugs: { de: 'y' } })).rejects.toThrow(
            'not one of this project'
        );
        await expect(page({ label: 'X', slug: 'x', slugs: { fr: 'à propos' } })).rejects.toThrow(
            'URL-safe'
        );
        await expect(page({ label: 'X', slug: 'x', slugs: { fr: 'a-propos' } })).rejects.toThrow(
            'already uses the slug "a-propos"'
        );
    });

    it('redirects a live page’s old address, and its entries’, when it moves', async () => {
        const about = await page({ label: 'About', slug: 'about', slugs: { fr: 'a-propos' } });
        const b = await blog();

        await updatePage(projectId, user, about.id, { slugs: { fr: 'qui-sommes-nous' } });
        await updatePage(projectId, user, b.id, { slug: 'journal' });

        const redirects = (await listRedirects(projectId)).map(r => [r.from, r.to, r.auto]);
        expect(redirects).toEqual(
            expect.arrayContaining([
                ['/fr/a-propos', '/fr/qui-sommes-nous', true],
                ['/blog', '/journal', true],
                ['/blog/the-factory', '/journal/the-factory', true]
            ])
        );
        // The French addresses didn't change, so they have no redirect.
        expect(redirects.some(([from]) => from === '/fr/blogue')).toBe(false);

        // Moving it back: the old address is live again, and the redirect follows.
        await updatePage(projectId, user, b.id, { slug: 'blog' });
        const after = await listRedirects(projectId);
        expect(after.find(r => r.from === '/blog')).toBeUndefined();
        expect(after.find(r => r.from === '/journal')?.to).toBe('/blog');
    });

    it('redirects when a page moves under another, and not for a draft', async () => {
        const section = await createPage(projectId, user, {
            type: 'folder',
            label: 'Company',
            slug: 'company',
            slugs: { fr: 'entreprise' }
        } as never);
        const about = await page({ label: 'About', slug: 'about', slugs: { fr: 'a-propos' } });
        const draft = await page({ label: 'Draft', slug: 'draft', status: 'draft' });

        await reorderPages(projectId, user, [
            { id: about.id, parentId: section.id, order: 0 },
            { id: draft.id, parentId: section.id, order: 1 }
        ]);
        expect((await listRedirects(projectId)).map(r => [r.from, r.to])).toEqual([
            ['/about', '/company/about'],
            ['/fr/a-propos', '/fr/entreprise/a-propos']
        ]);
    });

    it('redirects an entry’s old address when it is published with a new slug', async () => {
        await blog();
        await updateEntry(user, projectId, 'article', 'factory', {
            data: {
                title: { en: 'The Factory', fr: "L'usine" },
                slug: { en: 'the-factory-that-never-stops', fr: 'l-usine' }
            }
        });
        // A draft doesn't move the live address.
        expect(await listRedirects(projectId)).toEqual([]);

        await publishEntry(user, projectId, 'article', 'factory');
        await vi.waitFor(async () =>
            expect((await listRedirects(projectId)).map(r => [r.from, r.to])).toEqual([
                ['/blog/the-factory', '/blog/the-factory-that-never-stops']
            ])
        );
    });

    it('says what lives at a path: a page in a language, a redirect, or nothing', async () => {
        await page({ label: 'About', slug: 'about', slugs: { fr: 'a-propos' } });
        await createRedirect(projectId, user, { from: '/old-about/', to: '/about' });

        expect(await resolvePath(projectId, '/fr/a-propos')).toMatchObject({
            match: 'page',
            locale: 'fr',
            alternates: { en: '/about', fr: '/fr/a-propos' }
        });
        expect(await resolvePath(projectId, '/old-about')).toEqual({
            match: 'redirect',
            from: '/old-about',
            to: '/about',
            status: 301
        });
        expect(await resolvePath(projectId, '/nowhere')).toBeNull();
        expect(await resolvePath(projectId, 'nowhere')).toBeNull();
    });
});

describe('redirects by hand', () => {
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-redirects-'));
        projDir = path.join(tempDir, 'data', 'projects', projectId);
        await fs.mkdir(projDir, { recursive: true });
        await fs.writeFile(path.join(tempDir, 'data', 'users.json'), '[]');
        vi.stubEnv('DATA_ROOT', tempDir);
        await writeProject();
        await initRepo(projDir);
        await createTemplate(projectId, user, {
            id: 'basic',
            label: 'Basic',
            fields: {}
        } as never);
    });
    afterEach(async () => {
        vi.unstubAllEnvs();
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('follows chains to the end and refuses loops', async () => {
        const ab = await createRedirect(projectId, user, { from: '/a', to: '/b' });
        // c → a becomes c → b: one hop for visitors and search engines.
        const ca = await createRedirect(projectId, user, { from: '/c', to: '/a', status: 302 });
        expect(ca).toMatchObject({ from: '/c', to: '/b', status: 302 });
        // b → d moves everything that went to b.
        await createRedirect(projectId, user, { from: '/b', to: '/d' });
        const list = await listRedirects(projectId);
        expect(list.map(r => [r.from, r.to])).toEqual([
            ['/a', '/d'],
            ['/c', '/d'],
            ['/b', '/d']
        ]);
        await expect(createRedirect(projectId, user, { from: '/d', to: '/a' })).rejects.toThrow(
            'loop'
        );
        await expect(createRedirect(projectId, user, { from: '/a', to: '/x' })).rejects.toThrow(
            'already a redirect from /a'
        );

        const edited = await updateRedirect(projectId, user, ab.id, {
            to: 'https://example.com/a'
        });
        expect(edited.to).toBe('https://example.com/a');
        await deleteRedirect(projectId, user, ab.id);
        expect((await listRedirects(projectId)).map(r => r.from)).toEqual(['/c', '/b']);
    });

    it('refuses what isn’t a path, and an address a live page uses', async () => {
        await page({ label: 'About', slug: 'about' });
        await expect(createRedirect(projectId, user, { from: 'about', to: '/x' })).rejects.toThrow(
            'starting with /'
        );
        await expect(
            createRedirect(projectId, user, { from: '/x?y=1', to: '/about' })
        ).rejects.toThrow('no query');
        await expect(
            createRedirect(projectId, user, { from: '/x', to: 'javascript:alert(1)' })
        ).rejects.toThrow('http(s)');
        await expect(
            createRedirect(projectId, user, { from: '/x', to: '/y', status: 307 as never })
        ).rejects.toThrow('301');
        await expect(createRedirect(projectId, user, { from: '/about', to: '/x' })).rejects.toThrow(
            'A live page is at /about'
        );
    });

    it('lets only people who change content manage them', async () => {
        const translator: User = { ...user, id: 'r1', roles: ['translator'] };
        await writeProject({ users: ['u1', 'r1'] });
        await expect(
            createRedirect(projectId, translator, { from: '/a', to: '/b' })
        ).rejects.toThrow('cannot change content');
    });
});
