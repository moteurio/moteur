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
    snapshotWorkspace,
    restoreWorkspace,
    getCurrentBranch,
    WORKSPACE_SNAPSHOT_BRANCH
} from '../../src/git/index.js';

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
            const hash = addAndCommit(tempDir, ['project.json'], 'Initial commit', {
                name: 'Test',
                email: 'test@test.com'
            });
            expect(hash).toBeTruthy();
            expect(hash.length).toBe(40);
            const log = getLog(tempDir, 'project.json', 5);
            expect(log.length).toBe(1);
            expect(log[0].message).toBe('Initial commit');
            expect(log[0].authorName).toBe('Test');
        });

        it('does not commit when no staged changes', async () => {
            const filePath = path.join(tempDir, 'project.json');
            await fs.writeFile(filePath, JSON.stringify({ id: 'test' }), 'utf-8');
            addAndCommit(tempDir, ['project.json'], 'First', {
                name: 'A',
                email: 'a@a.com'
            });
            const logBefore = getLog(tempDir, 'project.json', 5);
            expect(logBefore.length).toBe(1);
            const hashBefore = logBefore[0].hash;
            const noCommitHash = addAndCommit(tempDir, ['project.json'], 'Second (no change)', {
                name: 'B',
                email: 'b@b.com'
            });
            expect(noCommitHash).toBe('');
            const logAfter = getLog(tempDir, 'project.json', 5);
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
            const hash = addAllAndCommit(tempDir, 'Copy project', {
                name: 'User',
                email: 'u@u.com'
            });
            expect(hash).toBeTruthy();
            const log = getLog(tempDir, 'a.json', 5);
            expect(log.length).toBe(1);
        });
    });

    describe('getRepoLog', () => {
        beforeEach(async () => {
            await initRepo(tempDir);
        });

        it('returns full repo history newest-first chunk', async () => {
            await fs.writeFile(path.join(tempDir, 'a.json'), '{}', 'utf-8');
            addAndCommit(tempDir, ['a.json'], 'One', { name: 'A', email: 'a@a.com' });
            await fs.writeFile(path.join(tempDir, 'b.json'), '{}', 'utf-8');
            addAndCommit(tempDir, ['b.json'], 'Two', { name: 'B', email: 'b@b.com' });
            const repoLog = getRepoLog(tempDir, 10);
            expect(repoLog.length).toBe(2);
            expect(repoLog[0].message).toBe('Two');
            expect(repoLog[1].message).toBe('One');
        });
    });

    describe('getLog', () => {
        beforeEach(async () => {
            await initRepo(tempDir);
            await fs.writeFile(path.join(tempDir, 'file.json'), '{}', 'utf-8');
            addAndCommit(tempDir, ['file.json'], 'Commit 1', {
                name: 'Dev',
                email: 'dev@dev.com'
            });
        });

        it('returns commit history for a file', () => {
            const log = getLog(tempDir, 'file.json', 10);
            expect(log.length).toBe(1);
            expect(log[0].hash).toBeTruthy();
            expect(log[0].message).toBe('Commit 1');
            expect(log[0].authorName).toBe('Dev');
            expect(log[0].date).toBeTruthy();
        });

        it('returns empty array for non-git dir', async () => {
            const nonRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-norepo-'));
            try {
                const log = getLog(nonRepo, 'file.json');
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
            addAndCommit(tempDir, ['content.json'], 'Add content', {
                name: 'X',
                email: 'x@x.com'
            });
        });

        it('returns file content at HEAD', () => {
            const log = getLog(tempDir, 'content.json', 1);
            expect(log.length).toBe(1);
            const content = show(tempDir, log[0].hash, 'content.json');
            expect(content).toContain('"v":1');
        });

        it('returns null for missing file at rev', () => {
            const log = getLog(tempDir, 'content.json', 1);
            expect(log.length).toBe(1);
            const content = show(tempDir, log[0].hash, 'nonexistent.json');
            expect(content).toBeNull();
        });
    });

    describe('isGitRepo', () => {
        it('returns false for empty dir', () => {
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

    describe('snapshotWorkspace', () => {
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
            await snapshotWorkspace(tempDir, 'Test snapshot', { name: 'T', email: 't@t.com' });
            expect(getCurrentBranch(tempDir)).toBe('main');
            const r = spawnSync(
                'git',
                ['show', '--name-only', '--format=', 'moteur-workspace-snapshots'],
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

    describe('restoreWorkspace', () => {
        beforeEach(async () => {
            await initRepo(tempDir);
            await fs.mkdir(path.join(tempDir, '.moteur'), { recursive: true });
            await fs.writeFile(path.join(tempDir, '.moteur', 'activity.json'), '[]', 'utf-8');
        });

        it('files restored, does not delete files absent from snapshot', async () => {
            await snapshotWorkspace(tempDir, 'Snap', { name: 'U', email: 'u@u.com' });
            await fs.writeFile(path.join(tempDir, '.moteur', 'extra.json'), '{}', 'utf-8');
            await restoreWorkspace(tempDir, WORKSPACE_SNAPSHOT_BRANCH);
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
});
