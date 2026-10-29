import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { addAndCommit, gitIdle, initRepo } from '../../src/git/index.js';
import { commitContentChange } from '../../src/git/contentCommitHook.js';

const user = { id: 'u1', name: 'Ada', email: 'ada@test.dev', isActive: true, roles: [] } as never;
const log = (dir: string) =>
    spawnSync('git', ['log', '--name-only', '--format=%s'], { cwd: dir, encoding: 'utf8' }).stdout;

describe('commits that miss', () => {
    let root: string;
    let dir: string;
    beforeEach(async () => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-commit-retry-'));
        vi.stubEnv('DATA_ROOT', root);
        dir = path.join(root, 'data', 'projects', 'site');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
            path.join(dir, 'project.json'),
            JSON.stringify({ id: 'site', label: 'Site' })
        );
        await initRepo(dir);
        await addAndCommit(dir, ['project.json'], 'Start', user);
    });
    afterEach(async () => {
        await gitIdle();
        vi.unstubAllEnvs();
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('commit what exists when a listed path Git never knew is gone', async () => {
        fs.writeFileSync(path.join(dir, 'a.json'), '{}');
        expect(await addAndCommit(dir, ['a.json', 'never-there.json'], 'Mixed', user)).toMatch(
            /^[0-9a-f]{40}$/
        );
        expect(await addAndCommit(dir, ['never-there.json'], 'Nothing', user)).toBe('');
    });

    it('take a change whose commit failed into the project’s next commit', async () => {
        fs.writeFileSync(path.join(dir, 'first.json'), '{"v":1}');
        // Blocked (as by a full disk, or a lock).
        fs.writeFileSync(path.join(dir, '.git', 'index.lock'), '');
        expect(
            await commitContentChange({
                projectId: 'site',
                paths: ['first.json'],
                message: 'First',
                user
            })
        ).toBeUndefined();
        fs.rmSync(path.join(dir, '.git', 'index.lock'));

        fs.writeFileSync(path.join(dir, 'second.json'), '{"v":2}');
        await commitContentChange({
            projectId: 'site',
            paths: ['second.json'],
            message: 'Second',
            user
        });
        const history = log(dir);
        expect(history).toMatch(/Second\s+(first\.json\s+second\.json|second\.json\s+first\.json)/);
    });
});
