import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { addAndCommit, gitIdle, initRepo } from '../../src/git/index.js';
import { registerContentCommitHook } from '../../src/git/contentCommitHook.js';
import { triggerEvent } from '../../src/utils/eventBus.js';

const ada = { id: 'ada', name: 'Ada', email: 'ada@test.dev', isActive: true, roles: [] } as never;
const bo = { id: 'bo', name: 'Bo', email: 'bo@test.dev', isActive: true, roles: [] } as never;
const git = (dir: string, ...args: string[]) =>
    spawnSync('git', args, { cwd: dir, encoding: 'utf8' }).stdout.trim();

describe('saves while a commit runs', () => {
    let root: string;
    let dir: string;
    beforeAll(() => registerContentCommitHook());
    beforeEach(async () => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-grouped-'));
        vi.stubEnv('DATA_ROOT', root);
        dir = path.join(root, 'data', 'projects', 'site');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
            path.join(dir, 'project.json'),
            JSON.stringify({ id: 'site', label: 'Site' })
        );
        await initRepo(dir);
        await addAndCommit(dir, ['project.json'], 'Start', ada);
    });
    afterEach(async () => {
        await gitIdle();
        vi.unstubAllEnvs();
        fs.rmSync(root, { recursive: true, force: true });
    });

    /** A save as the engine makes one: the file written, then the event. */
    const save = (file: string, text: string, user: never, name: string) => {
        fs.writeFileSync(path.join(dir, file), text);
        return triggerEvent('content.saved', {
            projectId: 'site',
            paths: [file],
            message: `Update ${file} — ${name}`,
            user
        });
    };

    it('commits the first save alone, and those that waited behind it as one', async () => {
        await Promise.all(
            Array.from({ length: 10 }, (_, i) => save(`e${i}.json`, `{"v":${i}}`, ada, 'Ada'))
        );
        await gitIdle();
        const subjects = git(dir, 'log', '--format=%s').split('\n');
        expect(subjects).toEqual(['9 saves — Ada', 'Update e0.json — Ada', 'Start']);
        // Every save is in history, and the grouped commit lists them.
        for (let i = 0; i < 10; i++) expect(git(dir, 'show', `HEAD:e${i}.json`)).toBe(`{"v":${i}}`);
        expect(git(dir, 'log', '-1', '--format=%b')).toContain('Update e9.json — Ada');
    });

    it('keeps each author’s saves apart', async () => {
        await Promise.all([
            save('a0.json', '0', ada, 'Ada'),
            save('b1.json', '1', bo, 'Bo'),
            save('a2.json', '2', ada, 'Ada'),
            save('b3.json', '3', bo, 'Bo'),
            save('a4.json', '4', ada, 'Ada via Claude')
        ]);
        await gitIdle();
        const commits = git(dir, 'log', '--format=%an|%s', '-n', '4').split('\n');
        expect(commits).toEqual(
            expect.arrayContaining([
                'Bo|2 saves — Bo',
                'Ada|Update a2.json — Ada',
                'Ada|Update a4.json — Ada via Claude'
            ])
        );
        expect(git(dir, 'log', '--format=%an', '--', 'b3.json')).toBe('Bo');
        expect(git(dir, 'log', '--format=%s', '--', 'a4.json')).toBe(
            'Update a4.json — Ada via Claude'
        );
    });

    it('puts a file two people saved in the last one’s commit', async () => {
        await Promise.all([
            save('first.json', 'x', ada, 'Ada'),
            save('shared.json', 'by Ada', ada, 'Ada'),
            save('shared.json', 'by Bo', bo, 'Bo')
        ]);
        await gitIdle();
        expect(git(dir, 'show', 'HEAD:shared.json')).toBe('by Bo');
        expect(git(dir, 'log', '--format=%an', '--', 'shared.json')).toBe('Bo');
    });
});
