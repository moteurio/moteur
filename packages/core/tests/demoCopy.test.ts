import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { copyProjectForNewUser, createProject } = await import('../src/projects.js');
const { reloadUsers } = await import('../src/users.js');

describe('copying the demo for someone', () => {
    let root: string;
    let projects: string;
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-demo-copy-'));
        projects = path.join(root, 'data', 'projects');
        vi.stubEnv('DATA_ROOT', root);
        vi.stubEnv('AUTH_USERS_FILE', path.join(root, 'users.json'));
        fs.writeFileSync(
            path.join(root, 'users.json'),
            JSON.stringify([
                { id: 'user:ada', email: 'ada@dev.test', isActive: true, roles: [], projects: [] }
            ])
        );
        reloadUsers();
        const demo = path.join(projects, 'demo');
        const write = (file: string, value: unknown) => {
            fs.mkdirSync(path.dirname(path.join(demo, file)), { recursive: true });
            fs.writeFileSync(path.join(demo, file), JSON.stringify(value));
        };
        write('project.json', {
            id: 'demo',
            label: 'Moteur Journal',
            defaultLocale: 'fr',
            users: ['louise'],
            apiKeys: [{ id: 'k', hash: 'abc' }],
            git: { remoteUrl: 'https://github.com/agency/journal.git' },
            integrations: { shopify: { shopDomain: 'x.myshopify.com' } },
            assetConfig: { adapter: 's3', adapterConfig: { bucket: 'journal' } }
        });
        write('models/article/model.json', { id: 'article', label: 'Article' });
        write('pages/home.json', {
            id: 'home',
            type: 'static',
            label: 'Home',
            slug: '',
            parentId: null,
            order: 0,
            templateId: 'page',
            status: 'published',
            fields: {}
        });
        write('.moteur/comments.json', [{ id: 'c1' }]);
        write('.moteur/secrets.json', { git: { token: 'sealed' } });
        write('.moteur/notifications.json', [{ userId: 'louise' }]);
        write('.moteur/webhook-log.json', [{ id: 'd1' }]);
        write('webhooks.json', [{ url: 'https://api.netlify.com/build_hooks/x' }]);
        write('user-data/forms/contact/s1.json', { data: { email: 'rose@example.com' } });
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        reloadUsers();
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('takes the content only: never the workspace, credentials, hooks or what visitors sent', async () => {
        await copyProjectForNewUser('demo', 'demo-ada', 'user:ada');
        const copy = path.join(projects, 'demo-ada');
        const has = (file: string) => fs.existsSync(path.join(copy, file));
        expect(has('models/article/model.json')).toBe(true);
        // Live pages come along, pinned in the copy's own history, under its name.
        const home = JSON.parse(fs.readFileSync(path.join(copy, 'pages/home.json'), 'utf8'));
        expect(home).toMatchObject({ id: 'home', status: 'published' });
        expect(home.publishedCommit).toMatch(/^[0-9a-f]{40}$/);
        // Saving the copy may leave its own secrets file, but none of the source's secrets.
        const secrets = path.join(copy, '.moteur/secrets.json');
        if (fs.existsSync(secrets))
            expect(fs.readFileSync(secrets, 'utf8')).not.toContain('sealed');
        for (const gone of [
            '.moteur/comments.json',
            '.moteur/notifications.json',
            '.moteur/webhook-log.json',
            'webhooks.json',
            'user-data/forms/contact/s1.json'
        ])
            expect(has(gone), gone).toBe(false);
        const project = JSON.parse(fs.readFileSync(path.join(copy, 'project.json'), 'utf8'));
        expect(project).toMatchObject({
            id: 'demo-ada',
            label: 'Moteur Journal',
            users: ['user:ada']
        });
        for (const key of ['apiKeys', 'git', 'integrations', 'assetConfig'])
            expect(project[key], key).toBeUndefined();
        expect(project.memberRoles['user:ada']).toEqual(['admin', 'billing', 'developer']);
    });

    it('keeps the demo’s address for the server', async () => {
        vi.stubEnv('DEMO_PROJECT_ID', 'journal-demo');
        const ada = {
            id: 'user:ada',
            email: 'ada@dev.test',
            isActive: true,
            roles: [],
            projects: []
        };
        await expect(
            createProject(ada, {
                id: 'journal-demo',
                label: 'Mine now',
                defaultLocale: 'en'
            } as never)
        ).rejects.toMatchObject({ status: 409 });
    });
});
