import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import {
    addAllAndCommit,
    gitStatus,
    initRepo,
    flushPushes,
    gitIdle,
    push,
    removeStaleLocks,
    schedulePush,
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
        await addAllAndCommit(repo, 'First', user as never);
    });
    afterEach(async () => {
        vi.unstubAllEnvs();
        await flushPushes();
        await gitIdle();
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    });

    it('says nothing is owed without a remote', async () => {
        expect(gitStatus(repo)).toMatchObject({ remoteUrl: null, unpushed: null });
        expect(gitStatus(repo).lastCommit?.message).toBe('First');
    });

    it('pushes a branch that was never pushed, then counts what the remote lacks', async () => {
        setRemoteOrigin(repo, remote);
        expect(gitStatus(repo)).toMatchObject({ remoteUrl: remote, unpushed: 1 });

        expect(await push(repo)).toBe(true);
        expect(gitStatus(repo).unpushed).toBe(0);

        await fs.writeFile(path.join(repo, 'b.json'), '{}');
        await addAllAndCommit(repo, 'Second', user as never);
        expect(gitStatus(repo).unpushed).toBe(1);
        expect(await push(repo)).toBe(true);
        expect(gitStatus(repo).unpushed).toBe(0);
    });

    it('reports a failed push, and keeps counting', async () => {
        setRemoteOrigin(repo, path.join(tempDir, 'nowhere.git'));
        expect(await push(repo)).toBe(false);
        expect(gitStatus(repo).unpushed).toBe(1);
    });

    it('pushes in the background, once for the commits made close together', async () => {
        vi.stubEnv('MOTEUR_GIT_PUSH_DELAY_MS', '50');
        setRemoteOrigin(repo, remote);
        const heard: boolean[] = [];
        schedulePush(repo, pushed => heard.push(pushed));
        await fs.writeFile(path.join(repo, 'b.json'), '{}');
        await addAllAndCommit(repo, 'Second', user as never);
        schedulePush(repo, pushed => heard.push(pushed));
        // Nothing waited on the network: still owed right after scheduling.
        expect(gitStatus(repo).unpushed).toBe(2);
        await vi.waitFor(() => expect(heard).toEqual([true, true]));
        expect(gitStatus(repo).unpushed).toBe(0);
    });

    it('keeps the server answering while a push is slow', async () => {
        // A remote that takes a moment to accept, as one across the network does.
        const slow = path.join(tempDir, 'slow-receive.sh');
        await fs.writeFile(slow, `#!/bin/sh\nsleep 0.5\nexec git-receive-pack "$@"\n`, {
            mode: 0o755
        });
        setRemoteOrigin(repo, remote);
        spawnSync('git', ['config', 'remote.origin.receivepack', `"${slow}"`], { cwd: repo });
        let ticks = 0;
        const timer = setInterval(() => ticks++, 10);
        let pushDone = false;
        const pushing = push(repo).then(ok => ((pushDone = true), ok));
        // A save in the same project meanwhile: its commit doesn't wait for the push.
        await fs.writeFile(path.join(repo, 'b.json'), '{}');
        await addAllAndCommit(repo, 'During the push', user as never);
        expect(pushDone).toBe(false);
        const pushed = await pushing;
        clearInterval(timer);
        expect(pushed).toBe(true);
        // A blocking push would leave the event loop no turn at all.
        expect(ticks).toBeGreaterThan(20);
    });

    it('names the commit HEAD is at, with its refs packed too', async () => {
        const head = () =>
            spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).stdout.trim();
        await fs.writeFile(path.join(repo, 'c.json'), '{}');
        expect(await addAllAndCommit(repo, 'Third', user as never)).toBe(head());
        spawnSync('git', ['pack-refs', '--all'], { cwd: repo });
        // Nothing new to commit: HEAD as it is, read from packed-refs.
        expect(await addAllAndCommit(repo, 'Nothing', user as never)).toBe(head());
    });

    it('clears the locks a stopped Git left behind, so commits work again', async () => {
        await fs.writeFile(path.join(repo, '.git', 'index.lock'), '');
        await fs.writeFile(path.join(repo, 'd.json'), '{}');
        await expect(addAllAndCommit(repo, 'Blocked', user as never)).rejects.toThrow(
            /index\.lock/
        );
        expect(removeStaleLocks(repo)).toEqual(['index.lock']);
        expect(removeStaleLocks(repo)).toEqual([]);
        await expect(addAllAndCommit(repo, 'Unblocked', user as never)).resolves.toMatch(
            /^[0-9a-f]{40}$/
        );
    });
});
