import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { initRepo } from '../../src/git/index.js';
import { gitIdle } from '../../src/git/gitService.js';
import { createTemplate } from '../../src/templates.js';
import { createPage, getPageBySlug, resolveAllUrls, updatePage } from '../../src/pages.js';
import { createNavigation, resolveNavigation } from '../../src/navigations.js';
import type { User } from '@moteurio/types/User.js';

const projectId = 'many-languages';
const admin = {
    id: 'a1',
    name: 'Ada',
    isActive: true,
    roles: ['admin'],
    projects: [projectId]
} as User;

describe('addresses in each language', () => {
    let tempDir: string;
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-languages-'));
        const dir = path.join(tempDir, 'data', 'projects', projectId);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(
            path.join(dir, 'project.json'),
            JSON.stringify({
                id: projectId,
                label: 'P',
                defaultLocale: 'en',
                supportedLocales: ['fr', 'zh-Hans'],
                users: ['a1']
            })
        );
        vi.stubEnv('DATA_ROOT', tempDir);
        await initRepo(dir);
        await createTemplate(projectId, admin, { id: 'page', label: 'Page', fields: {} } as never);
    });
    afterEach(async () => {
        vi.unstubAllEnvs();
        await gitIdle();
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    const page = (label: string, slug: string, extra: object = {}) =>
        createPage(projectId, admin, {
            type: 'static',
            label,
            slug,
            templateId: 'page',
            status: 'published',
            fields: {},
            ...extra
        } as never);

    it('gives a menu its language’s addresses, children included', async () => {
        const pricing = await page('Pricing', 'pricing', { slugs: { fr: 'tarifs' } });
        const docs = await page('Docs', 'docs', { slugs: { fr: 'documentation' } });
        const menu = await createNavigation(projectId, admin, {
            name: 'Main',
            handle: 'main',
            items: [
                {
                    id: 'i1',
                    label: { en: 'Pricing', fr: 'Tarifs' },
                    linkType: 'page',
                    pageId: pricing.id,
                    children: [
                        {
                            id: 'i2',
                            label: { en: 'Docs', fr: 'Docs' },
                            linkType: 'page',
                            pageId: docs.id
                        }
                    ]
                }
            ]
        } as never);
        const fr = await resolveNavigation(projectId, menu, { locale: 'fr', fallback: 'en' });
        expect(fr.items[0]).toMatchObject({ label: 'Tarifs', url: '/fr/tarifs' });
        expect(fr.items[0].children?.[0]).toMatchObject({ url: '/fr/documentation' });
        const en = await resolveNavigation(projectId, menu, { locale: 'en', fallback: 'en' });
        expect(en.items[0].url).toBe('/pricing');
    });

    it('gives a page addresses only in its languages, and links elsewhere lead to the default', async () => {
        const guide = await page('Guide', 'guide', { languages: ['en'] });
        const both = await page('Pricing', 'pricing', {
            languages: ['fr'],
            slugs: { fr: 'tarifs' }
        });
        expect(guide.languages).toEqual(['en']);
        expect(both.languages).toEqual(['en', 'fr']);

        const urls = await resolveAllUrls(projectId);
        const of = (id: string) => urls.filter(u => u.nodeId === id).map(u => u.url);
        expect(of(guide.id)).toEqual(['/guide']);
        expect(of(both.id)).toEqual(['/pricing', '/fr/tarifs']);
        expect(urls.find(u => u.nodeId === guide.id)!.alternates).toEqual({ en: '/guide' });
        expect(await getPageBySlug(projectId, 'guide', 'fr')).toBeNull();

        const menu = await createNavigation(projectId, admin, {
            name: 'Main',
            handle: 'main',
            items: [
                {
                    id: 'i1',
                    label: { en: 'Guide', fr: 'Guide' },
                    linkType: 'page',
                    pageId: guide.id
                }
            ]
        } as never);
        const fr = await resolveNavigation(projectId, menu, { locale: 'fr', fallback: 'en' });
        expect(fr.items[0]!.url).toBe('/guide');

        // Every language again: [] (or null) clears the list.
        const all = await updatePage(projectId, admin, guide.id, { languages: [] } as never);
        expect(all.languages).toBeUndefined();
        expect((await resolveAllUrls(projectId)).filter(u => u.nodeId === guide.id)).toHaveLength(
            3
        );
    });

    it('refuses a language the project does not have', async () => {
        await expect(page('Guide', 'guide', { languages: ['de'] })).rejects.toThrow(
            /"de" is not one of this project's languages/
        );
    });

    it('keeps the locale as the project spells it', async () => {
        await page('About', 'about');
        const urls = (await resolveAllUrls(projectId)).map(u => u.url);
        expect(urls).toContain('/zh-Hans/about');
        expect(urls).not.toContain('/zh-hans/about');
    });
});
