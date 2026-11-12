import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';
import {
    initRepo,
    writeGitignore,
    addAndCommit,
    addAllAndCommit,
    getLog,
    getRepoLog,
    show,
    isGitRepo,
    GITIGNORE_LINES,
    snapshotState,
    restoreState,
    getCurrentBranch,
    STATE_SNAPSHOT_BRANCH
} from '../../src/git/index.js';
import { gitVersion } from '../../src/git/gitService.js';

describe('gitService', () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-git-test-'));
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    });

    describe('initRepo', () => {
        it('creates .git and .gitignore', async () => {
            await initRepo(tempDir);
            expect(isGitRepo(tempDir)).toBe(true);
            const gitignore = await fs.readFile(path.join(tempDir, '.gitignore'), 'utf-8');
            GITIGNORE_LINES.forEach(line => {
                expect(gitignore).toContain(line);
            });
        });

        it('is idempotent when repo already exists', async () => {
            await initRepo(tempDir);
            await initRepo(tempDir);
            expect(isGitRepo(tempDir)).toBe(true);
        });
    });

    describe('writeGitignore', () => {
        it('merges new lines with existing', async () => {
            await fs.writeFile(path.join(tempDir, '.gitignore'), 'existing.txt\n', 'utf-8');
            await writeGitignore(tempDir);
            const content = await fs.readFile(path.join(tempDir, '.gitignore'), 'utf-8');
            expect(content).toContain('existing.txt');
            expect(content).toContain('.moteur/');
            expect(content).toContain('user-data/');
        });
    });

    describe('addAndCommit', () => {
        beforeEach(async () => {
            await initRepo(tempDir);
        });

        it('commits when there are changes', async () => {
            const filePath = path.join(tempDir, 'project.json');
            await fs.writeFile(filePath, JSON.stringify({ id: 'test' }), 'utf-8');
            const hash = await addAndCommit(tempDir, ['project.json'], 'Initial commit', {
                name: 'Test',
                email: 'test@test.com'
            });
            expect(hash).toBeTruthy();
            expect(hash.length).toBe(40);
            const log = await getLog(tempDir, 'project.json', 5);
            expect(log.length).toBe(1);
            expect(log[0].message).toBe('Initial commit');
            expect(log[0].authorName).toBe('Test');
        });

        it('does not commit when no staged changes', async () => {
            const filePath = path.join(tempDir, 'project.json');
            await fs.writeFile(filePath, JSON.stringify({ id: 'test' }), 'utf-8');
            await addAndCommit(tempDir, ['project.json'], 'First', {
                name: 'A',
                email: 'a@a.com'
            });
            const logBefore = await getLog(tempDir, 'project.json', 5);
            expect(logBefore.length).toBe(1);
            const hashBefore = logBefore[0].hash;
            const noCommitHash = await addAndCommit(
                tempDir,
                ['project.json'],
                'Second (no change)',
                {
                    name: 'B',
                    email: 'b@b.com'
                }
            );
            expect(noCommitHash).toBe('');
            const logAfter = await getLog(tempDir, 'project.json', 5);
            expect(logAfter.length).toBe(1);
            expect(logAfter[0].hash).toBe(hashBefore);
        });
    });

    describe('addAllAndCommit', () => {
        beforeEach(async () => {
            await initRepo(tempDir);
        });

        it('commits all files', async () => {
            await fs.writeFile(path.join(tempDir, 'a.json'), '{}', 'utf-8');
            await fs.writeFile(path.join(tempDir, 'b.json'), '{}', 'utf-8');
            const hash = await addAllAndCommit(tempDir, 'Copy project', {
                name: 'User',
                email: 'u@u.com'
            });
            expect(hash).toBeTruthy();
            const log = await getLog(tempDir, 'a.json', 5);
            expect(log.length).toBe(1);
        });
    });

    describe('getRepoLog', () => {
        beforeEach(async () => {
            await initRepo(tempDir);
        });

        it('returns full repo history newest-first chunk', async () => {
            await fs.writeFile(path.join(tempDir, 'a.json'), '{}', 'utf-8');
            await addAndCommit(tempDir, ['a.json'], 'One', { name: 'A', email: 'a@a.com' });
            await fs.writeFile(path.join(tempDir, 'b.json'), '{}', 'utf-8');
            await addAndCommit(tempDir, ['b.json'], 'Two', { name: 'B', email: 'b@b.com' });
            const repoLog = getRepoLog(tempDir, 10);
            expect(repoLog.length).toBe(2);
            expect(repoLog[0].message).toBe('Two');
            expect(repoLog[1].message).toBe('One');
        });

        it('never evaluates a runtime count as shell syntax', async () => {
            getRepoLog(tempDir, '1$(touch INJECTED_COUNT)' as unknown as number);
            await expect(fs.access(path.join(tempDir, 'INJECTED_COUNT'))).rejects.toThrow();
        });
    });

    describe('getLog', () => {
        beforeEach(async () => {
            await initRepo(tempDir);
            await fs.writeFile(path.join(tempDir, 'file.json'), '{}', 'utf-8');
            await addAndCommit(tempDir, ['file.json'], 'Commit 1', {
                name: 'Dev',
                email: 'dev@dev.com'
            });
        });

        it('returns commit history for a file', async () => {
            const log = await getLog(tempDir, 'file.json', 10);
            expect(log.length).toBe(1);
            expect(log[0].hash).toBeTruthy();
            expect(log[0].message).toBe('Commit 1');
            expect(log[0].authorName).toBe('Dev');
            expect(log[0].date).toBeTruthy();
        });

        it.each([
            '$(touch INJECTED_LOG).json',
            '`touch INJECTED_LOG`.json',
            'quoted "document".json'
        ])('treats the path %s as data while preserving its history', async filename => {
            await fs.writeFile(path.join(tempDir, filename), '{}');
            const hash = await addAndCommit(tempDir, [filename], 'Literal filename', {
                name: 'Test',
                email: 'test@example.com'
            });
            const log = await getLog(tempDir, filename, 10);
            await expect(fs.access(path.join(tempDir, 'INJECTED_LOG'))).rejects.toThrow();
            expect(log[0]?.hash).toBe(hash);
        });

        it('returns empty array for non-git dir', async () => {
            const nonRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-norepo-'));
            try {
                const log = await getLog(nonRepo, 'file.json');
                expect(log).toEqual([]);
            } finally {
                await fs.rm(nonRepo, { recursive: true, force: true }).catch(() => {});
            }
        });
    });

    describe('show', () => {
        beforeEach(async () => {
            await initRepo(tempDir);
            await fs.writeFile(path.join(tempDir, 'content.json'), '{"v":1}', 'utf-8');
            await addAndCommit(tempDir, ['content.json'], 'Add content', {
                name: 'X',
                email: 'x@x.com'
            });
        });

        it('returns file content at HEAD', async () => {
            const log = await getLog(tempDir, 'content.json', 1);
            expect(log.length).toBe(1);
            const content = await show(tempDir, log[0].hash, 'content.json');
            expect(content).toContain('"v":1');
        });

        it.each([
            '$(touch INJECTED_SHOW).json',
            '`touch INJECTED_SHOW`.json',
            'quoted "document".json'
        ])('reads the literal path %s without executing it', async filename => {
            await fs.writeFile(path.join(tempDir, filename), '{"literal":true}');
            const hash = await addAndCommit(tempDir, [filename], 'Literal content', {
                name: 'Test',
                email: 'test@example.com'
            });
            const content = await show(tempDir, hash, filename);
            await expect(fs.access(path.join(tempDir, 'INJECTED_SHOW'))).rejects.toThrow();
            expect(content).toBe('{"literal":true}');
        });

        it('does not evaluate shell syntax in a revision', async () => {
            expect(
                await show(tempDir, 'HEAD$(touch INJECTED_REVISION)', 'content.json')
            ).toBeNull();
            await expect(fs.access(path.join(tempDir, 'INJECTED_REVISION'))).rejects.toThrow();
        });

        it('does not interpret a revision as a Git option', async () => {
            expect(await show(tempDir, '--output=INJECTED_OPTION', 'content.json')).toBeNull();
            await expect(
                fs.access(path.join(tempDir, 'INJECTED_OPTION:content.json'))
            ).rejects.toThrow();
        });

        it('returns null for missing file at rev', async () => {
            const log = await getLog(tempDir, 'content.json', 1);
            expect(log.length).toBe(1);
            const content = await show(tempDir, log[0].hash, 'nonexistent.json');
            expect(content).toBeNull();
        });
    });

    describe('isGitRepo', () => {
        it('returns false for empty dir', async () => {
            expect(isGitRepo(tempDir)).toBe(false);
        });

        it('returns true after init', async () => {
            await initRepo(tempDir);
            expect(isGitRepo(tempDir)).toBe(true);
        });
    });

    describe('.gitignore', () => {
        it('.moteur/ and user-data/ present after project init', async () => {
            await initRepo(tempDir);
            const gitignore = await fs.readFile(path.join(tempDir, '.gitignore'), 'utf-8');
            expect(gitignore).toContain('.moteur/');
            expect(gitignore).toContain('user-data/');
        });
    });

    describe('snapshotState', () => {
        beforeEach(async () => {
            await initRepo(tempDir);
            await fs.mkdir(path.join(tempDir, '.moteur'), { recursive: true });
            await fs.writeFile(path.join(tempDir, '.moteur', 'activity.json'), '[]', 'utf-8');
        });

        it('orphan branch created if not exists, correct files committed, secrets.json excluded', async () => {
            await fs.writeFile(
                path.join(tempDir, '.moteur', 'secrets.json'),
                '{"key":"secret"}',
                'utf-8'
            );
            await snapshotState(tempDir, 'Test snapshot', { name: 'T', email: 't@t.com' });
            expect(getCurrentBranch(tempDir)).toBe('main');
            const r = spawnSync(
                'git',
                ['show', '--name-only', '--format=', 'moteur-state-snapshots'],
                {
                    cwd: tempDir,
                    encoding: 'utf-8'
                }
            );
            expect(r.status).toBe(0);
            const names = r.stdout.trim().split(/\n/).filter(Boolean);
            expect(names.some(n => n.includes('activity.json'))).toBe(true);
            expect(names.some(n => n.includes('secrets.json'))).toBe(false);
        });
    });

    describe('restoreState', () => {
        beforeEach(async () => {
            await initRepo(tempDir);
            await fs.mkdir(path.join(tempDir, '.moteur'), { recursive: true });
            await fs.writeFile(path.join(tempDir, '.moteur', 'activity.json'), '[]', 'utf-8');
        });

        it('files restored, does not delete files absent from snapshot', async () => {
            await snapshotState(tempDir, 'Snap', { name: 'U', email: 'u@u.com' });
            await fs.writeFile(path.join(tempDir, '.moteur', 'extra.json'), '{}', 'utf-8');
            await restoreState(tempDir, STATE_SNAPSHOT_BRANCH);
            const extraPath = path.join(tempDir, '.moteur', 'extra.json');
            try {
                await fs.access(extraPath);
            } catch {
                expect.fail(
                    'extra.json should still exist (restore must not delete files absent from snapshot)'
                );
            }
        });
    });

    describe('gitVersion', () => {
        it('says which git runs, or null when there is none', () => {
            expect(gitVersion()).toMatch(/^git version \d/);
            expect(gitVersion('git-that-is-not-installed')).toBeNull();
        });
    });

    describe('commits made from the index', () => {
        const git = (...args: string[]) =>
            spawnSync('git', args, { cwd: tempDir, encoding: 'utf-8' }).stdout.trim();
        const author = { name: 'Ada', email: 'ada@test.dev' };

        it('makes the first commit, without a parent, on the branch HEAD names', async () => {
            await initRepo(tempDir);
            await fs.writeFile(path.join(tempDir, 'a.json'), '{"v":1}');
            const first = await addAndCommit(tempDir, ['a.json'], 'First', author);
            expect(first).toMatch(/^[0-9a-f]{40}$/);
            expect(git('rev-parse', 'HEAD')).toBe(first);
            expect(git('rev-list', '--parents', '-n', '1', 'HEAD')).toBe(first);
            expect(getCurrentBranch(tempDir)).toBe(git('symbolic-ref', '--short', 'HEAD'));
            expect(git('log', '-1', '--format=%an <%ae>|%s')).toBe('Ada <ada@test.dev>|First');
        });

        it('commits changes and deletions on top, and nothing when nothing changed', async () => {
            await initRepo(tempDir);
            await fs.writeFile(path.join(tempDir, 'a.json'), '1');
            await fs.writeFile(path.join(tempDir, 'b.json'), '1');
            const first = await addAndCommit(tempDir, ['a.json', 'b.json'], 'One', author);
            await fs.writeFile(path.join(tempDir, 'a.json'), '2');
            await fs.rm(path.join(tempDir, 'b.json'));
            const second = await addAndCommit(
                tempDir,
                ['a.json', 'b.json'],
                'Two\n\nWith a body',
                author
            );
            expect(git('rev-parse', `${second}^`)).toBe(first);
            expect(git('show', 'HEAD:a.json')).toBe('2');
            expect(git('ls-tree', '--name-only', 'HEAD')).not.toContain('b.json');
            expect(git('log', '-1', '--format=%B')).toBe('Two\n\nWith a body');
            // The same content again: no commit.
            expect(await addAndCommit(tempDir, ['a.json'], 'Three', author)).toBe('');
            expect(git('rev-parse', 'HEAD')).toBe(second);
            // The reflog says what moved the branch, and the repository is whole.
            expect(git('reflog', '-1', '--format=%gs')).toBe('commit: Two');
            expect(spawnSync('git', ['fsck', '--no-progress'], { cwd: tempDir }).status).toBe(0);
        });

        it('commits everything after a copy, or says where HEAD is when nothing changed', async () => {
            await initRepo(tempDir);
            await fs.writeFile(path.join(tempDir, 'a.json'), '1');
            const head = await addAllAndCommit(tempDir, 'Copy', author);
            expect(git('rev-parse', 'HEAD')).toBe(head);
            expect(await addAllAndCommit(tempDir, 'Again', author)).toBe(head);
        });
    });
});
