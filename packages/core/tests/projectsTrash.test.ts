import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const projects = await import('../src/projects.js');
const { getUserById, reloadUsers } = await import('../src/users.js');
const { gitIdle } = await import('../src/git/gitService.js');

const ADA = 'user:ada';

describe('deleted projects, and deleting them for good', () => {
    let root: string;
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-trash-'));
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
        vi.useRealTimers();
        reloadUsers();
        fs.rmSync(root, { recursive: true, force: true });
    });

    const make = async (id: string) => {
        await projects.createProject(getUserById(ADA)!, { id, label: id, defaultLocale: 'en' });
        await gitIdle();
    };

    it('keeps every deletion of the same id, newest first', async () => {
        vi.useFakeTimers({ now: new Date('2026-11-01T10:00:00Z'), toFake: ['Date'] });
        await make('journal');
        await projects.deleteProject(getUserById(ADA)!, 'journal');
        vi.setSystemTime(new Date('2026-11-02T10:00:00Z'));
        await make('journal');
        await projects.deleteProject(getUserById(ADA)!, 'journal');
        expect(projects.listTrashedProjects()).toEqual([
            {
                id: 'journal',
                deletedAt: '2026-11-02T10:00:00Z',
                folder: 'journal@2026-11-02T10-00-00Z'
            },
            {
                id: 'journal',
                deletedAt: '2026-11-01T10:00:00Z',
                folder: 'journal@2026-11-01T10-00-00Z'
            }
        ]);
    });

    it('takes the project’s bin with it, so one with deleted entries can be deleted', async () => {
        await make('journal');
        const bin = path.join(
            root,
            'data',
            'projects',
            '.trash',
            'projects',
            'journal',
            'models',
            'post'
        );
        fs.mkdirSync(bin, { recursive: true });
        fs.writeFileSync(path.join(bin, 'binned.json'), '{}');
        await projects.deleteProject(getUserById(ADA)!, 'journal');
        const [copy] = projects.listTrashedProjects();
        const kept = path.join(
            root,
            'data',
            'projects',
            '.trash',
            'deleted-projects',
            copy!.folder,
            '.bin',
            'models',
            'post',
            'binned.json'
        );
        expect(fs.existsSync(kept)).toBe(true);
        expect(
            fs.existsSync(path.join(root, 'data', 'projects', '.trash', 'projects', 'journal'))
        ).toBe(false);
    });

    it('removes one from the trash for good', async () => {
        await make('journal');
        await projects.deleteProject(getUserById(ADA)!, 'journal');
        const [copy] = projects.listTrashedProjects();
        projects.purgeTrashedProject(copy!.folder);
        expect(projects.listTrashedProjects()).toEqual([]);
        expect(() => projects.purgeTrashedProject(copy!.folder)).toThrow(
            /No such project in the trash/
        );
    });

    it('deletes a live project for good: gone from its members, its id free', async () => {
        await make('journal');
        expect(getUserById(ADA)!.projects).toContain('journal');
        await projects.purgeProject(getUserById(ADA)!, 'journal');
        reloadUsers();
        expect(getUserById(ADA)!.projects).not.toContain('journal');
        expect(projects.listTrashedProjects()).toEqual([]);
        expect(fs.existsSync(path.join(root, 'data', 'projects', 'journal'))).toBe(false);
        await make('journal');
        expect(await projects.getProjectById('journal')).toBeTruthy();
    });
});
