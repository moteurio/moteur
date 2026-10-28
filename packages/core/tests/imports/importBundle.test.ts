import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import '../../src/fields/index.js';
import '../../src/assets/index.js';
import { initRepo } from '../../src/git/index.js';
import { listNavigations } from '../../src/navigations.js';
import { registerContentCommitHook } from '../../src/git/contentCommitHook.js';
import { importBundle } from '../../src/imports/importBundle.js';
import {
    approveImport,
    getImport,
    listImports,
    startImport
} from '../../src/imports/importJobs.js';
import { exportBundle } from '../../src/imports/exportBundle.js';
import { getPage, listPages } from '../../src/pages.js';
import { publicPage } from '../../src/pages/publishedPages.js';
import { getEntryForProject } from '../../src/entries.js';
import { listAssets } from '../../src/assets/assetService.js';
import { getNavigationByHandle } from '../../src/navigations.js';
import { listRedirects } from '../../src/redirects.js';
import { listTemplates } from '../../src/templates.js';
import type { ImportBundle } from '@moteurio/types/Import.js';
import type { User } from '@moteurio/types/User.js';

registerContentCommitHook();

const projectId = 'import-site';
const other = 'import-copy';
const admin = {
    id: 'u1',
    name: 'Ada',
    isActive: true,
    roles: ['admin'],
    projects: [projectId, other]
} as User;
const agent = { ...admin, agent: { name: 'Claude', reviewOnly: true } } as User;

const PNG =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

let tempDir: string;
const dirOf = (id: string) => path.join(tempDir, 'data', 'projects', id);
const git = (id: string, ...args: string[]) =>
    execFileSync('git', args, { cwd: dirOf(id), encoding: 'utf8' }).trim();
const commits = (id: string) => Number(git(id, 'rev-list', '--count', 'HEAD'));
/** Saves made outside an import are committed by a hook, a moment later. */
const settled = (id: string) => vi.waitFor(() => expect(changed(id)).toBe(''));
/**
 * Files changed and not committed. Not counted: the workspace, uploaded files themselves (kept
 * beside the content, not in its history) and project.json, which reading the project fills in.
 */
const changed = (id: string) =>
    git(id, 'status', '--porcelain', '--', '.', ':!.moteur', ':!assets', ':!project.json');

/** The moteur.io site in small: a CTA structure, a hero block, a page tree, an author. */
function site(extra: Partial<ImportBundle> = {}, ns = projectId): ImportBundle {
    return {
        version: 1,
        structures: [
            {
                type: 'cta',
                label: 'CTA',
                fields: {
                    label: { type: 'core/text', label: 'Label', options: { multilingual: true } },
                    link: { type: 'core/link', label: 'Link' }
                }
            }
        ],
        blocks: [
            {
                type: `${ns}/hero`,
                label: 'Hero',
                fields: {
                    title: { type: 'core/text', label: 'Title', options: { multilingual: true } },
                    shot: { type: 'core/asset', label: 'Screenshot' },
                    cta: { type: 'core/structure', label: 'CTA', options: { structure: 'cta' } }
                }
            } as never
        ],
        models: [
            {
                id: 'author',
                label: 'Author',
                fields: { name: { type: 'core/text', label: 'Name' } }
            } as never,
            {
                id: 'post',
                label: 'Post',
                fields: {
                    title: { type: 'core/text', label: 'Title' },
                    author: {
                        type: 'core/relation',
                        label: 'Author',
                        options: { model: 'author', allowEmpty: true }
                    }
                }
            } as never
        ],
        templates: [
            {
                id: 'page',
                label: 'Page',
                fields: {
                    blocks: {
                        type: 'core/block-list',
                        label: 'Blocks',
                        options: { allowEmpty: true }
                    }
                }
            } as never
        ],
        assets: [{ ref: 'inbox', content: PNG, name: 'inbox.png', alt: 'The inbox' }],
        pages: [
            {
                id: 'home',
                label: 'Home',
                slug: '',
                templateId: 'page',
                fields: {
                    blocks: [
                        {
                            type: `${ns}/hero`,
                            data: {
                                title: { en: 'Moteur' },
                                shot: { assetId: { $ref: 'asset:inbox' } },
                                cta: {
                                    label: { en: 'See the API' },
                                    link: { pageId: { $ref: 'page:api' } }
                                }
                            }
                        }
                    ]
                }
            },
            // Its parent comes after it: pages are saved parents first.
            {
                ref: 'api',
                id: 'api',
                parent: 'docs',
                label: 'API',
                slug: 'api',
                templateId: 'page',
                fields: {}
            },
            { id: 'docs', type: 'folder', label: 'Docs', slug: 'docs' }
        ],
        entries: {
            post: [{ id: 'hello', data: { title: 'Hello', author: { $ref: 'entry:author/ada' } } }],
            author: [{ id: 'ada', data: { name: 'Ada' } }]
        },
        menus: [
            {
                handle: 'header',
                label: 'Header',
                items: [{ id: 'i1', label: 'API', type: 'page', pageId: { $ref: 'page:api' } }]
            }
        ],
        redirects: [{ from: '/old-api', to: '/docs/api', status: 301 }],
        ...extra
    };
}

async function makeProject(id: string) {
    const dir = dirOf(id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
        path.join(dir, 'project.json'),
        JSON.stringify({ id, label: id, defaultLocale: 'en', users: ['u1'] })
    );
    await initRepo(dir);
    git(id, 'add', '-A');
    git(id, '-c', 'user.name=T', '-c', 'user.email=t@t', 'commit', '-qm', 'Start');
}

beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-import-'));
    vi.stubEnv('DATA_ROOT', tempDir);
    vi.stubEnv('STATIC_ASSETS_BASE_URL', 'http://localhost:3000');
    await makeProject(projectId);
    await makeProject(other);
});
afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(tempDir, { recursive: true, force: true });
});

describe('importing a bundle', () => {
    it('saves everything, wiring refs, in one commit', async () => {
        const before = commits(projectId);
        const out = await importBundle(admin, projectId, site());
        expect(out.issues).toEqual([]);
        expect(out.status).toBe('done');
        expect(commits(projectId)).toBe(before + 1);
        expect(git(projectId, 'log', '-1', '--format=%s')).toMatch(
            /^Import 3 pages, 2 entries, 1 file/
        );
        expect(changed(projectId)).toBe('');

        const [asset] = await listAssets(projectId);
        const home = (await getPage(projectId, 'home')) as never as { fields: any; status: string };
        const hero = home.fields.blocks[0].data;
        expect(hero.shot.assetId).toBe(asset!.id);
        expect(hero.cta.link.pageId).toBe('api');
        expect(home.status).toBe('draft');
        expect((await getPage(projectId, 'api')).parentId).toBe('docs');
        expect((await getEntryForProject(projectId, 'post', 'hello'))!.data.author).toBe('ada');
        expect((await getNavigationByHandle(projectId, 'header'))!.items[0]).toMatchObject({
            pageId: 'api'
        });
        expect((await listRedirects(projectId)).map(r => r.from)).toEqual(['/old-api']);
    });

    it('keeps nothing when one thing fails', async () => {
        await settled(projectId);
        const before = commits(projectId);
        const out = await importBundle(
            admin,
            projectId,
            site({
                entries: {
                    post: [{ id: 'x', data: { title: 'X' } }],
                    nope: [{ id: 'y', data: {} }]
                }
            })
        );
        expect(out.status).toBe('failed');
        expect(out.issues[0]!.path).toBe('entries.nope[0]');
        expect(commits(projectId)).toBe(before);
        expect(changed(projectId)).toBe('');
        expect(await listPages(projectId)).toEqual([]);
        expect(await listTemplates(projectId)).toEqual([]);
        expect(await listAssets(projectId)).toEqual([]);
        expect(await getEntryForProject(projectId, 'post', 'x').catch(() => null)).toBeNull();
    });

    it('in a dry run, saves nothing and reports every problem', async () => {
        const before = commits(projectId);
        const fine = await importBundle(admin, projectId, site(), { dryRun: true });
        expect(fine).toMatchObject({ status: 'done', dryRun: true, issues: [] });
        expect(fine.items.filter(i => i.kind === 'page')).toHaveLength(3);
        const bad = await importBundle(
            admin,
            projectId,
            site({
                entries: {
                    nope: [{ id: 'y', data: {} }],
                    post: [{ id: 'z', data: { author: { $ref: 'entry:author/nobody' } } }]
                }
            }),
            { dryRun: true }
        );
        expect(bad.status).toBe('failed');
        expect(bad.issues.map(i => i.path)).toEqual([
            'entries.nope[0]',
            'entries.post[0].data.author'
        ]);
        expect(commits(projectId)).toBe(before);
        expect(await listPages(projectId)).toEqual([]);
    });

    it('checks the bundle before saving anything', async () => {
        const out = await importBundle(admin, projectId, {
            version: 2,
            pages: [{ label: '', slug: 'x' }]
        } as never);
        expect(out.status).toBe('failed');
        expect(out.issues.map(i => i.path)).toEqual(['version']);
        const shapes = await importBundle(admin, projectId, {
            version: 1,
            assets: [{ ref: 'a', url: 'http://example.com/a.png' }],
            pages: [{ label: '', slug: 'x' }]
        } as never);
        expect(shapes.issues.map(i => i.path)).toEqual([
            'assets[0].url',
            'pages[0].label',
            'pages[0].templateId'
        ]);
    });

    it('updates, skips or refuses what is already there, without adding the same file twice', async () => {
        await importBundle(admin, projectId, site());
        const again = await importBundle(admin, projectId, site());
        expect(again.status).toBe('done');
        expect(again.items.find(i => i.kind === 'asset')!.action).toBe('skip');
        expect(again.items.find(i => i.id === 'home')!.action).toBe('update');
        expect(await listAssets(projectId)).toHaveLength(1);
        const skip = await importBundle(admin, projectId, site({ existing: 'skip' }));
        expect(skip.items.find(i => i.id === 'home')!.action).toBe('skip');
        const before = commits(projectId);
        const fail = await importBundle(admin, projectId, site({ existing: 'fail' }));
        expect(fail.status).toBe('failed');
        expect(fail.issues[0]!.message).toMatch(/already exists/);
        expect(commits(projectId)).toBe(before);
    });

    it('publishes for someone who can, and waits for a person after an agent', async () => {
        const out = await importBundle(admin, projectId, site({ publish: true }));
        expect(out.status).toBe('done');
        expect((await getPage(projectId, 'home')).status).toBe('published');
        expect((await getEntryForProject(projectId, 'post', 'hello'))!.status).toBe('published');

        const { finished } = await startImport(agent, other, site({ publish: true }, other));
        const job = await finished;
        expect(job.status).toBe('awaiting_approval');
        expect((await getPage(other, 'home')).status).toBe('draft');
        await expect(approveImport(agent, other, job.id)).rejects.toThrow(/person/);
        // A menu is live once saved: the agent's wait for the approval too.
        expect(job.toPublish?.menus?.length).toBeGreaterThan(0);
        expect(await listNavigations(other)).toEqual([]);
        const approved = await approveImport(admin, other, job.id);
        expect(approved).toMatchObject({ status: 'done', approvedBy: { id: 'u1' } });
        expect((await listNavigations(other)).length).toBe(job.toPublish!.menus!.length);
        expect((await getPage(other, 'home')).status).toBe('published');
        expect((await getImport(other, job.id))!.status).toBe('done');
    });

    it('is for admins, and keeps a block type to its folder', async () => {
        const writer = { ...admin, roles: ['writer'] } as User;
        await expect(startImport(writer, projectId, site())).rejects.toThrow(/admins/);
        await expect(exportBundle(writer, projectId)).rejects.toThrow(/admins/);

        const activity = path.join(dirOf(projectId), '.moteur', 'activity.json');
        await fs.mkdir(path.dirname(activity), { recursive: true });
        await fs.writeFile(activity, '[]');
        const sly = { version: 1, blocks: [{ type: '../.moteur/activity', label: 'X' }] } as never;
        for (const dryRun of [true, false]) {
            const out = await importBundle(admin, projectId, sly, { dryRun });
            expect(out.issues[0]!.message).toMatch(/not a block type/);
            expect(await fs.readFile(activity, 'utf8')).toBe('[]');
        }
    });

    it("leaves a live page as published until the import's publish step; a dry run, as it was", async () => {
        await importBundle(admin, projectId, site({ publish: true }));
        const live = async () =>
            ((await publicPage(projectId, await getPage(projectId, 'home'))) as any)?.label;
        expect(await live()).toBe('Home');

        const changed = site();
        changed.pages![0]!.label = 'Changed';
        const before = commits(projectId);
        await importBundle(admin, projectId, changed, { dryRun: true });
        expect((await getPage(projectId, 'home')).label).toBe('Home');
        expect(commits(projectId)).toBe(before);

        await importBundle(admin, projectId, changed);
        expect((await getPage(projectId, 'home')).label).toBe('Changed');
        expect(await live()).toBe('Home');

        await importBundle(admin, projectId, { ...changed, publish: true });
        expect(await live()).toBe('Changed');
    });

    it('exports a project as a bundle that makes it again', async () => {
        await importBundle(admin, projectId, site());
        const bundle = await exportBundle(admin, projectId);
        expect(bundle.blocks!.map(b => b.type)).toEqual([`${projectId}/hero`]);
        const shot = (bundle.pages!.find(p => p.id === 'home')!.fields as any).blocks[0].data.shot;
        expect(shot.assetId).toEqual({ $ref: `asset:${bundle.assets![0]!.ref}` });
        expect(bundle.assets![0]!.url).toMatch(/^http/);
    });

    it('undoes a job the server stopped in the middle of', async () => {
        const half = path.join(dirOf(projectId), 'pages', 'half.json');
        await fs.mkdir(path.dirname(half), { recursive: true });
        await fs.writeFile(half, '{}');
        await fs.mkdir(path.join(dirOf(projectId), '.moteur'), { recursive: true });
        await fs.writeFile(
            path.join(dirOf(projectId), '.moteur', 'imports.json'),
            JSON.stringify([
                {
                    id: 'j1',
                    projectId,
                    status: 'running',
                    dryRun: false,
                    createdAt: '',
                    by: { id: 'u1' },
                    progress: { done: 1, total: 2 },
                    items: [],
                    issues: [],
                    touched: ['pages/half.json']
                }
            ])
        );
        const [job] = await listImports(projectId);
        expect(job).toMatchObject({ id: 'j1', status: 'failed' });
        expect(job).not.toHaveProperty('touched');
        await expect(fs.access(half)).rejects.toThrow();
    });
});
