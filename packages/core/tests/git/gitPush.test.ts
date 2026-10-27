import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import {
    addAllAndCommit,
    gitStatus,
    initRepo,
    push,
    setRemoteOrigin
} from '../../src/git/index.js';

const user = { id: 'u1', name: 'Ada', email: 'ada@test.dev', isActive: true, roles: [] };

describe('pushing the content history', () => {
    let tempDir: string;
    let repo: string;
    let remote: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-git-push-'));
        repo = path.join(tempDir, 'project');
        remote = path.join(tempDir, 'remote.git');
        await fs.mkdir(repo);
        spawnSync('git', ['init', '--bare', remote]);
        await initRepo(repo);
        await fs.writeFile(path.join(repo, 'a.json'), '{}');
        addAllAndCommit(repo, 'First', user as never);
    });
    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    });

    it('says nothing is owed without a remote', () => {
        expect(gitStatus(repo)).toMatchObject({ remoteUrl: null, unpushed: null });
        expect(gitStatus(repo).lastCommit?.message).toBe('First');
    });

    it('pushes a branch that was never pushed, then counts what the remote lacks', async () => {
        setRemoteOrigin(repo, remote);
        expect(gitStatus(repo)).toMatchObject({ remoteUrl: remote, unpushed: 1 });

        expect(push(repo)).toBe(true);
        expect(gitStatus(repo).unpushed).toBe(0);

        await fs.writeFile(path.join(repo, 'b.json'), '{}');
        addAllAndCommit(repo, 'Second', user as never);
        expect(gitStatus(repo).unpushed).toBe(1);
        expect(push(repo)).toBe(true);
        expect(gitStatus(repo).unpushed).toBe(0);
    });

    it('reports a failed push, and keeps counting', async () => {
        setRemoteOrigin(repo, path.join(tempDir, 'nowhere.git'));
        expect(push(repo)).toBe(false);
        expect(gitStatus(repo).unpushed).toBe(1);
    });
});
