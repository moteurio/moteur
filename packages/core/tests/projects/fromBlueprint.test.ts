import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import '../../src/fields/index.js';

const projects = await import('../../src/projects.js');
const { getUserById, reloadUsers } = await import('../../src/users.js');
const { gitIdle } = await import('../../src/git/gitService.js');
const { registerBlueprint, createBlueprint, listBlueprints } =
    await import('../../src/blueprints.js');
const { getPage, listPages } = await import('../../src/pages.js');

const ADA = 'user:ada';
const mini = {
    id: 'mini',
    name: 'Mini site',
    kind: 'project' as const,
    bundle: {
        version: 1 as const,
        templates: [
            { id: 'page', label: 'Page', fields: { title: { type: 'core/text', label: 'Title' } } }
        ],
        pages: [
            {
                id: 'home',
                label: 'Home',
                slug: '',
                templateId: 'page',
                published: true,
                fields: { title: 'Hello' }
            }
        ]
    }
};

describe('a project made from a blueprint', () => {
    let root: string;
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-from-blueprint-'));
        vi.stubEnv('DATA_ROOT', root);
        vi.stubEnv('AUTH_USERS_FILE', path.join(root, 'users.json'));
        fs.writeFileSync(
            path.join(root, 'users.json'),
            JSON.stringify([
                { id: ADA, email: 'ada@dev.test', isActive: true, roles: ['admin'], projects: [] }
            ])
        );
        reloadUsers();
    });
    afterEach(async () => {
        await gitIdle();
        vi.unstubAllEnvs();
        reloadUsers();
        fs.rmSync(root, { recursive: true, force: true });
    });
    const ada = () => getUserById(ADA)!;

    it('starts with its bundle, live', async () => {
        registerBlueprint(mini as never);
        const made = await projects.createProjectFromBlueprint(
            ada(),
            { id: 'site', label: 'Site', defaultLocale: 'en' } as never,
            'mini'
        );
        expect(made.blueprint).toMatchObject({ id: 'mini', status: 'done', issues: [] });
        await gitIdle();
        expect((await getPage('site', 'home')).status).toBe('published');
    });

    it('gets its content while it waits for a plan, and the plan applies after', async () => {
        const limits = await import('../../src/planLimits.js');
        // A project waiting for a plan: room for nothing (the host's billing says 0 for it).
        limits.setCountLimit(() => 0);
        limits.setStorageLimit(() => 0);
        try {
            registerBlueprint(mini as never);
            const made = await projects.createProjectFromBlueprint(
                ada(),
                { id: 'waits', label: 'Waits', defaultLocale: 'en' } as never,
                'mini'
            );
            expect(made.blueprint).toMatchObject({ status: 'done', issues: [] });
            await gitIdle();
            expect((await getPage('waits', 'home')).status).toBe('published');
            // Outside its making, the plan's limits hold, and say what to do.
            expect(limits.getCountLimit('waits', 'pages')).toBe(0);
            expect(() => limits.assertStorageRoom('waits', 0, 10)).toThrow(/waiting for a plan/);
        } finally {
            limits.setCountLimit(null);
            limits.setStorageLimit(null);
        }
    });

    it('adds a blueprint to an empty project made without it, and never to one with content', async () => {
        registerBlueprint(mini as never);
        await projects.createProjectFromBlueprint(
            ada(),
            { id: 'bare', label: 'Bare', defaultLocale: 'en' } as never,
            undefined
        );
        await expect(
            projects.applyBlueprintToProject(ada(), 'bare', 'mini')
        ).resolves.toMatchObject({
            id: 'mini',
            status: 'done',
            issues: []
        });
        await gitIdle();
        expect((await getPage('bare', 'home')).status).toBe('published');
        // It has content now: a second blueprint would replace some of it.
        await expect(projects.applyBlueprintToProject(ada(), 'bare', 'mini')).rejects.toMatchObject(
            {
                status: 409,
                code: 'PROJECT_NOT_EMPTY'
            }
        );
        await expect(projects.applyBlueprintToProject(ada(), 'bare', 'nope')).rejects.toMatchObject(
            {
                status: 404
            }
        );
    });

    it('says why when its bundle fails, and the project is made empty', async () => {
        registerBlueprint({
            ...mini,
            id: 'broken',
            bundle: {
                version: 1,
                pages: [{ id: 'home', label: 'Home', slug: '', templateId: 'nope' }]
            }
        } as never);
        const made = await projects.createProjectFromBlueprint(
            ada(),
            { id: 'site2', label: 'Site', defaultLocale: 'en' } as never,
            'broken'
        );
        expect(made.project?.id).toBe('site2');
        expect(made.blueprint?.status).toBe('failed');
        expect(made.blueprint?.issues.length).toBeGreaterThan(0);
        expect(await listPages('site2')).toEqual([]);
    });

    it('refuses a blueprint that does not exist, before making anything', async () => {
        await expect(
            projects.createProjectFromBlueprint(
                ada(),
                { id: 'site3', label: 'Site', defaultLocale: 'en' } as never,
                'missing'
            )
        ).rejects.toMatchObject({ status: 404, code: 'BLUEPRINT_NOT_FOUND' });
        expect(fs.existsSync(path.join(root, 'data', 'projects', 'site3'))).toBe(false);
    });

    it('takes a bundle, not a template, and leaves out a plugin’s broken one', () => {
        expect(() =>
            createBlueprint({
                id: 'old',
                name: 'Old',
                kind: 'project',
                template: { model: {} }
            } as never)
        ).toThrow(/bundle/);
        registerBlueprint({
            id: 'bad',
            name: 'Bad',
            kind: 'project',
            bundle: { version: 2 }
        } as never);
        expect(listBlueprints('project').map(b => b.id)).not.toContain('bad');
    });
});
