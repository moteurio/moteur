import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { initRepo } from '../../src/git/index.js';
import { createTemplate } from '../../src/templates.js';
import { createPage, getPage, updatePage } from '../../src/pages.js';
import type { StaticPage } from '@moteurio/types/Page.js';

const projectId = 'page-drafts';
const user = { id: 'u1', name: 'Ada', isActive: true, roles: ['admin'], projects: [projectId] };

describe('page drafts', () => {
    let tempDir: string;
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-page-drafts-'));
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
                headline: { type: 'core/text', label: 'Headline', options: { required: true } },
                intro: { type: 'core/textarea', label: 'Intro' }
            }
        } as never);
    });
    afterEach(async () => {
        vi.unstubAllEnvs();
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('saves a draft with required fields empty, and refuses to publish it', async () => {
        const page = (await createPage(projectId, user, {
            type: 'static',
            label: 'About',
            slug: 'about',
            templateId: 'landing',
            fields: { intro: 'Hello' }
        } as never)) as StaticPage;
        expect(page.status).toBe('draft');

        await expect(
            updatePage(projectId, user, page.id, { status: 'published' })
        ).rejects.toMatchObject({
            code: 'ENTRY_INCOMPLETE',
            missing: ['headline']
        });

        const live = (await updatePage(projectId, user, page.id, {
            fields: { intro: 'Hello', headline: 'About us' },
            status: 'published'
        } as never)) as StaticPage;
        expect(live.status).toBe('published');
    });

    it('refuses a page created live without its required fields', async () => {
        await expect(
            createPage(projectId, user, {
                type: 'static',
                label: 'Home',
                slug: '',
                templateId: 'landing',
                status: 'published',
                fields: {}
            } as never)
        ).rejects.toThrow('Publishing needs every required field');
    });
});
