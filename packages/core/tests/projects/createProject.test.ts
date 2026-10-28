import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const git = vi.hoisted(() => ({ failInit: false }));
vi.mock('../../src/git/index.js', async importOriginal => {
    const real = await importOriginal<typeof import('../../src/git/index.js')>();
    return {
        ...real,
        initRepo: async (dir: string) => {
            if (git.failInit) throw new Error('git: cannot read /root/.gitconfig');
            return real.initRepo(dir);
        }
    };
});

const { createProject } = await import('../../src/projects.js');
const { reloadUsers } = await import('../../src/users.js');

const ada = { id: 'user:ada', email: 'ada@dev.test', isActive: true, roles: [], projects: [] };
const site = { id: 'site', label: 'Site', defaultLocale: 'en' };

describe('making a project', () => {
    let root: string;
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-create-project-'));
        vi.stubEnv('DATA_ROOT', root);
        vi.stubEnv('AUTH_USERS_FILE', path.join(root, 'users.json'));
        fs.writeFileSync(path.join(root, 'users.json'), JSON.stringify([ada]));
        reloadUsers();
        git.failInit = false;
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        reloadUsers();
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('leaves nothing behind when it fails, so the id can be used again', async () => {
        git.failInit = true;
        await expect(createProject(ada as never, site as never)).rejects.toThrow(/gitconfig/);
        expect(fs.existsSync(path.join(root, 'data', 'projects', 'site'))).toBe(false);

        git.failInit = false;
        const made = await createProject(ada as never, site as never);
        expect(made.project?.id).toBe('site');
    });
});
