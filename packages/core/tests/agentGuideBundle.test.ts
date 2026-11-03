/**
 * The skill's example bundle (skills/moteur/examples/site.json) imports as the skill says it does:
 * everything saved and live, addresses per language, links to pages, rich text from HTML.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import '../src/fields/index.js';
import '../src/assets/index.js';
import { initRepo } from '../src/git/index.js';
import { gitIdle } from '../src/git/gitService.js';
import { registerContentCommitHook } from '../src/git/contentCommitHook.js';
import { importBundle } from '../src/imports/importBundle.js';
import { getPage, resolveAllUrls } from '../src/pages.js';
import { getEntryForProject } from '../src/entries.js';
import { getNavigationByHandle, resolveNavigation } from '../src/navigations.js';
import type { ImportBundle } from '@moteurio/types/Import.js';
import type { User } from '@moteurio/types/User.js';

registerContentCommitHook();
const BUNDLE = path.resolve(import.meta.dirname, '../../../skills/moteur/examples/site.json');
const projectId = 'skill-example';
const admin = {
    id: 'u1',
    name: 'Ada',
    isActive: true,
    roles: ['admin', 'developer'],
    projects: [projectId]
} as User;

describe('the skill’s example bundle', () => {
    let tempDir: string;
    beforeEach(async () => {
        tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'moteur-skill-'));
        vi.stubEnv('DATA_ROOT', tempDir);
        vi.stubEnv('STATIC_ASSETS_BASE_URL', 'http://localhost:3000');
        const dir = path.join(tempDir, 'data', 'projects', projectId);
        await fsp.mkdir(dir, { recursive: true });
        await fsp.writeFile(
            path.join(dir, 'project.json'),
            JSON.stringify({
                id: projectId,
                label: 'Example',
                defaultLocale: 'en',
                supportedLocales: ['fr'],
                users: ['u1']
            })
        );
        await initRepo(dir);
    });
    afterEach(async () => {
        vi.unstubAllEnvs();
        await gitIdle();
        await fsp.rm(tempDir, { recursive: true, force: true });
    });

    it('imports cleanly, live, with addresses, links and rich text as the skill says', async () => {
        const bundle = JSON.parse(fs.readFileSync(BUNDLE, 'utf8')) as ImportBundle;
        const dry = await importBundle(admin, projectId, bundle, { dryRun: true });
        expect(dry.issues).toEqual([]);
        const out = await importBundle(admin, projectId, bundle);
        expect(out.issues).toEqual([]);
        expect(out.status).toBe('done');
        expect(out.notes?.map(n => n.message)).toEqual([
            '2 links in HTML now lead to a page, following it.'
        ]);
        await gitIdle();

        expect((await getPage(projectId, 'home')).status).toBe('published');
        const urls = (await resolveAllUrls(projectId)).map(u => u.url).sort();
        expect(urls).toEqual(
            [
                '/',
                '/blog',
                '/blog/hello',
                '/docs/guide',
                '/fr',
                '/fr/blog',
                '/fr/blog/bonjour',
                '/fr/tarifs',
                '/pricing'
            ].sort()
        );

        const menu = await getNavigationByHandle(projectId, 'main');
        const fr = await resolveNavigation(projectId, menu!, { locale: 'fr', fallback: 'en' });
        expect(fr.items.map(i => [i.label, i.url])).toEqual([
            ['Tarifs', '/fr/tarifs'],
            ['Blogue', '/fr/blog']
        ]);

        const post = await getEntryForProject(projectId, 'post', 'hello');
        const link = (post!.data.body as any).dast.fr.document.children[0].children[1];
        expect(link).toMatchObject({ type: 'link', meta: [{ id: 'pageId', value: 'pricing' }] });
        expect((await getEntryForProject(projectId, 'settings', 'settings'))?.data.siteName).toBe(
            'Example'
        );
    });
});
