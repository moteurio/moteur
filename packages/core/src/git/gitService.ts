import { execSync, spawn, spawnSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

/** Paths to exclude from the repo. Workspace and user data are gitignored; content is tracked. */
export const GITIGNORE_LINES = ['.moteur/', 'user-data/', '.trash/'];

export interface GitAuthor {
    name: string;
    email: string;
}

function safeAuthor(user: { name?: string; email?: string; id?: string }): GitAuthor {
    const name = (user?.name ?? user?.id ?? 'Unknown').trim() || 'Moteur';
    const email = (user?.email ?? '').trim() || 'moteur@local';
    return { name, email };
}

/**
 * Run a git command in the project directory. Uses spawnSync so arguments (e.g. commit message) are not parsed by a shell.
 */
function git(projectDir: string, args: string[], env?: Record<string, string>): string {
    const fullEnv = { ...process.env, ...env };
    const r = spawnSync('git', args, {
        cwd: projectDir,
        encoding: 'utf-8',
        env: fullEnv,
        // A commit of thousands of files lists each one; Node's default 1 MB fails with ENOBUFS.
        maxBuffer: 256 * 1024 * 1024
    });
    if (r.error) throw r.error;
    if (r.status !== 0) {
        const msg =
            r.stderr || (r.error && (r.error as Error).message) || `git ${args.join(' ')} failed`;
        const e = new Error(msg);
        (e as any).status = r.status;
        throw e;
    }
    return (r.stdout ?? '').trim();
}

/**
 * Check if the directory is a git repository.
 */
export function isGitRepo(projectDir: string): boolean {
    try {
        // Don't overthink it. If .git exists, it's a repo.
        return existsSync(path.join(projectDir, '.git'));
    } catch {
        return false;
    }
}

/**
 * Initialize a new git repository in the project directory and write default .gitignore.
 */
export async function initRepo(projectDir: string): Promise<void> {
    if (isGitRepo(projectDir)) return;
    git(projectDir, ['init']);
    await writeGitignore(projectDir);
}

/**
 * Clone a remote repository into the project directory.
 * Uses: git init, remote add, fetch, checkout (main or default branch).
 * If the remote is empty or fetch fails, leaves an empty repo and writes .gitignore.
 */
export async function cloneFromRemote(projectDir: string, remoteUrl: string): Promise<void> {
    if (isGitRepo(projectDir)) return;
    const fsPromises = await import('fs/promises');
    await fsPromises.mkdir(projectDir, { recursive: true });
    git(projectDir, ['init']);
    git(projectDir, ['remote', 'add', 'origin', remoteUrl.trim()]);
    try {
        git(projectDir, ['fetch', 'origin'], { GIT_TERMINAL_PROMPT: '0' });
        // Prefer origin/HEAD (default branch) or origin/main, then origin/master
        let branch: string | null = null;
        try {
            const head = git(projectDir, ['symbolic-ref', 'refs/remotes/origin/HEAD', '--short']);
            const m = head.match(/^origin\/(.+)$/);
            if (m) branch = m[1];
        } catch {
            // no symbolic-ref
        }
        if (!branch) {
            try {
                git(projectDir, ['rev-parse', '--verify', 'origin/main']);
                branch = 'main';
            } catch {
                try {
                    git(projectDir, ['rev-parse', '--verify', 'origin/master']);
                    branch = 'master';
                } catch {
                    branch = null;
                }
            }
        }
        if (branch) {
            git(projectDir, ['checkout', '-b', branch, `origin/${branch}`]);
        }
    } catch {
        // Empty remote or fetch failed: leave repo with no commits
    }
    await writeGitignore(projectDir);
}

/**
 * Write or merge default .gitignore into the project directory.
 */
export async function writeGitignore(projectDir: string): Promise<void> {
    const p = path.join(projectDir, '.gitignore');
    let existing = '';
    try {
        existing = await fs.readFile(p, 'utf-8');
    } catch {
        // no file yet
    }
    const lines = new Set(existing.split(/\r?\n/).filter(Boolean));
    GITIGNORE_LINES.forEach(line => lines.add(line));
    const content = [...lines].sort().join('\n') + '\n';
    await fs.writeFile(p, content, 'utf-8');
}

/**
 * Stage and commit the given paths (relative to project root).
 * Paths use forward slashes for git.
 */
export function addAndCommit(
    projectDir: string,
    relativePaths: string[],
    message: string,
    author: GitAuthor | { name?: string; email?: string; id?: string }
): string {
    const { name, email } = safeAuthor(author);
    const env = {
        GIT_AUTHOR_NAME: name,
        GIT_AUTHOR_EMAIL: email,
        GIT_COMMITTER_NAME: name,
        GIT_COMMITTER_EMAIL: email
    };
    if (relativePaths.length === 0) return '';
    const normalized = relativePaths.map(p => p.replace(/\\/g, '/'));
    // -A stages additions, modifications, and deletions for the given paths
    git(projectDir, ['add', '-A', '--', ...normalized], env);
    try {
        git(projectDir, ['diff', '--cached', '--quiet'], env);
        // No staged changes — no new commit
        return '';
    } catch {
        // exit 1 = staged changes; commit only then
        git(projectDir, ['commit', '-m', message], env);
    }
    return git(projectDir, ['rev-parse', 'HEAD']);
}

/**
 * Stage all changes (including new and deleted files) and commit. Used e.g. after copying a project.
 */
export function addAllAndCommit(
    projectDir: string,
    message: string,
    author: GitAuthor | { name?: string; email?: string; id?: string }
): string {
    const { name, email } = safeAuthor(author);
    const env = {
        GIT_AUTHOR_NAME: name,
        GIT_AUTHOR_EMAIL: email,
        GIT_COMMITTER_NAME: name,
        GIT_COMMITTER_EMAIL: email
    };
    git(projectDir, ['add', '-A'], env);
    try {
        git(projectDir, ['diff', '--cached', '--quiet'], env);
    } catch {
        git(projectDir, ['commit', '-m', message], env);
    }
    return git(projectDir, ['rev-parse', 'HEAD']);
}

export interface CommitInfo {
    hash: string;
    message: string;
    authorName: string;
    authorEmail: string;
    date: string;
}

/**
 * Get commit history for the current branch (entire repo), newest first.
 */
export function getRepoLog(projectDir: string, maxCount = 50): CommitInfo[] {
    if (!isGitRepo(projectDir)) return [];
    try {
        const out = execSync(`git log -n ${maxCount} --format=%H%n%s%n%an%n%ae%n%aI`, {
            cwd: projectDir,
            encoding: 'utf-8'
        }).trim();
        if (!out) return [];
        const lines = out.split(/\n/);
        const commits: CommitInfo[] = [];
        for (let i = 0; i < lines.length; i += 5) {
            if (i + 4 < lines.length) {
                commits.push({
                    hash: lines[i],
                    message: lines[i + 1],
                    authorName: lines[i + 2],
                    authorEmail: lines[i + 3],
                    date: lines[i + 4]
                });
            }
        }
        return commits;
    } catch {
        return [];
    }
}

/**
 * Get commit history for a single file (relative path).
 */
export function getLog(projectDir: string, relativePath: string, maxCount = 50): CommitInfo[] {
    if (!isGitRepo(projectDir)) return [];
    const normalized = relativePath.replace(/\\/g, '/');
    try {
        const out = execSync(
            `git log -n ${maxCount} --format=%H%n%s%n%an%n%ae%n%aI -- "${normalized}"`,
            { cwd: projectDir, encoding: 'utf-8' }
        ).trim();
        if (!out) return [];
        const lines = out.split(/\n/);
        const commits: CommitInfo[] = [];
        for (let i = 0; i < lines.length; i += 5) {
            if (i + 4 < lines.length) {
                commits.push({
                    hash: lines[i],
                    message: lines[i + 1],
                    authorName: lines[i + 2],
                    authorEmail: lines[i + 3],
                    date: lines[i + 4]
                });
            }
        }
        return commits;
    } catch {
        return [];
    }
}

/**
 * Get file content at a given revision. Returns null if file did not exist at that rev.
 */
export function show(projectDir: string, rev: string, relativePath: string): string | null {
    if (!isGitRepo(projectDir)) return null;
    const normalized = relativePath.replace(/\\/g, '/');
    try {
        return execSync(`git show "${rev}:${normalized}"`, {
            cwd: projectDir,
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024
        }).trim();
    } catch {
        return null;
    }
}

/** Run git asynchronously and collect stdout (binary-safe). Rejects on a non-zero exit. */
function gitAsync(projectDir: string, args: string[], input?: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const child = spawn('git', args, { cwd: projectDir });
        const out: Buffer[] = [];
        const err: Buffer[] = [];
        child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
        child.stderr.on('data', (chunk: Buffer) => err.push(chunk));
        child.on('error', reject);
        child.on('close', code => {
            if (code === 0) resolve(Buffer.concat(out));
            else reject(new Error(Buffer.concat(err).toString() || `git ${args[0]} failed`));
        });
        child.stdin.end(input ?? '');
    });
}

/** Above this many files at one revision, list its tree once instead of resolving each path. */
const LS_TREE_THRESHOLD = 64;

/** Blob id of every file at a revision. */
async function blobIds(projectDir: string, rev: string): Promise<Map<string, string>> {
    const ids = new Map<string, string>();
    const out = await gitAsync(projectDir, ['ls-tree', '-r', '-z', '--full-tree', rev]);
    // "<mode> blob <sha>\t<path>\0"
    for (const line of out.toString('utf-8').split('\0')) {
        const tab = line.indexOf('\t');
        if (tab < 0) continue;
        const [, type, sha] = line.slice(0, tab).split(' ');
        if (type === 'blob') ids.set(line.slice(tab + 1), sha);
    }
    return ids;
}

/**
 * Read many files at given revisions without blocking the event loop, with one
 * `git cat-file --batch` process. Specs are `<rev>:<path>`; the result maps each spec to its
 * content, or null when the file did not exist at that revision.
 *
 * git resolves `<rev>:<path>` by scanning each directory on the path, which gets slow for
 * thousands of files in a large directory, so big batches look blob ids up from one tree
 * listing per revision instead.
 */
export async function readBlobs(
    projectDir: string,
    specs: string[]
): Promise<Map<string, string | null>> {
    const result = new Map<string, string | null>();
    if (specs.length === 0 || !isGitRepo(projectDir)) {
        for (const spec of specs) result.set(spec, null);
        return result;
    }

    const byRev = new Map<string, string[]>();
    for (const spec of specs) {
        const rev = spec.slice(0, spec.indexOf(':'));
        const list = byRev.get(rev);
        if (list) list.push(spec);
        else byRev.set(rev, [spec]);
    }
    // What cat-file is asked for each spec: a blob id, the spec itself, or nothing (missing).
    const objects = new Map<string, string | null>(specs.map(spec => [spec, spec]));
    for (const [rev, revSpecs] of byRev) {
        if (revSpecs.length < LS_TREE_THRESHOLD) continue;
        let ids: Map<string, string>;
        try {
            ids = await blobIds(projectDir, rev);
        } catch {
            continue; // unknown revision: cat-file reports each spec missing
        }
        for (const spec of revSpecs) {
            objects.set(spec, ids.get(spec.slice(rev.length + 1).replace(/\\/g, '/')) ?? null);
        }
    }

    const asked = specs.filter(spec => objects.get(spec) != null);
    for (const spec of specs) if (objects.get(spec) == null) result.set(spec, null);
    if (asked.length === 0) return result;

    const out = await gitAsync(
        projectDir,
        ['cat-file', '--batch'],
        asked.map(spec => `${objects.get(spec)!.replace(/\\/g, '/')}\n`).join('')
    );
    let pos = 0;
    for (const spec of asked) {
        const eol = out.indexOf(0x0a, pos);
        if (eol < 0) {
            result.set(spec, null);
            continue;
        }
        // "<sha> <type> <size>" followed by the content, or "<object> missing"
        const header = /^[0-9a-f]+ (\w+) (\d+)$/.exec(out.toString('utf-8', pos, eol));
        pos = eol + 1;
        if (!header) {
            result.set(spec, null);
            continue;
        }
        const size = Number(header[2]);
        result.set(spec, header[1] === 'blob' ? out.toString('utf-8', pos, pos + size) : null);
        pos += size + 1;
    }
    return result;
}

/**
 * Ensure `origin` points at the given URL (add or set-url).
 */
export function setRemoteOrigin(projectDir: string, remoteUrl: string): void {
    if (!isGitRepo(projectDir)) throw new Error('Not a Git repository');
    const trimmed = remoteUrl.trim();
    if (!trimmed) return;
    try {
        git(projectDir, ['remote', 'get-url', 'origin']);
        git(projectDir, ['remote', 'set-url', 'origin', trimmed]);
    } catch {
        git(projectDir, ['remote', 'add', 'origin', trimmed]);
    }
}

/**
 * Push current branch to remote. Fails silently and returns false on error (e.g. no remote, auth).
 */
/** Whether the repository has at least one remote to push to. */
export function hasRemote(projectDir: string): boolean {
    if (!isGitRepo(projectDir)) return false;
    try {
        return git(projectDir, ['remote']).trim().length > 0;
    } catch {
        return false;
    }
}

export function push(projectDir: string): boolean {
    if (!isGitRepo(projectDir)) return false;
    try {
        git(projectDir, ['push']);
        return true;
    } catch {
        return false;
    }
}

/**
 * Push a specific branch to remote. Used e.g. to push workspace snapshot branch.
 */
export function pushBranch(projectDir: string, branch: string): boolean {
    if (!isGitRepo(projectDir)) return false;
    try {
        git(projectDir, ['push', 'origin', branch]);
        return true;
    } catch {
        return false;
    }
}

export const WORKSPACE_SNAPSHOT_BRANCH = 'moteur-workspace-snapshots';
/** Separate orphan branch for user-data/ snapshots. Do not mix with workspace. */
export const USERDATA_SNAPSHOT_BRANCH = 'moteur-userdata-snapshots';

const WORKSPACE_SECRETS_PATH = '.moteur/secrets.json';
/** Rebuildable caches (content index): never snapshotted. */
const WORKSPACE_CACHE_PATH = '.moteur/cache/';

/**
 * List local branch names (content branches). Excludes workspace snapshot branch from default list when filterWorkspaceBranch is true.
 */
export function listBranches(projectDir: string, filterWorkspaceBranch: boolean = true): string[] {
    if (!isGitRepo(projectDir)) return [];
    try {
        const out = spawnSync('git', ['branch', '--list', '--no-color'], {
            cwd: projectDir,
            encoding: 'utf-8'
        });
        if (out.status !== 0 || !out.stdout) return [];
        const branches = out.stdout
            .split(/\n/)
            .map(line => line.replace(/^\*?\s*/, '').trim())
            .filter(Boolean);
        if (filterWorkspaceBranch) {
            return branches.filter(b => b !== WORKSPACE_SNAPSHOT_BRANCH);
        }
        return branches;
    } catch {
        return [];
    }
}

/**
 * Create a new branch from a ref (default HEAD). Does not checkout.
 */
export function createBranch(
    projectDir: string,
    newBranchName: string,
    fromRef: string = 'HEAD'
): void {
    if (!isGitRepo(projectDir)) throw new Error('Not a Git repository');
    git(projectDir, ['branch', newBranchName, fromRef]);
}

/**
 * Checkout an existing branch. Working tree and HEAD switch to that branch.
 */
export function checkoutBranch(projectDir: string, branchName: string): void {
    if (!isGitRepo(projectDir)) throw new Error('Not a Git repository');
    git(projectDir, ['checkout', branchName]);
}

/**
 * Merge sourceBranch into the current branch. Fails if there are uncommitted changes.
 */
export function mergeBranch(
    projectDir: string,
    sourceBranch: string,
    author?: { name?: string; email?: string; id?: string }
): void {
    if (!isGitRepo(projectDir)) throw new Error('Not a Git repository');
    const { name, email } = safeAuthor(author ?? {});
    const env = {
        GIT_AUTHOR_NAME: name,
        GIT_AUTHOR_EMAIL: email,
        GIT_COMMITTER_NAME: name,
        GIT_COMMITTER_EMAIL: email
    };
    git(
        projectDir,
        ['merge', '--no-ff', '-m', `Merge branch '${sourceBranch}'`, sourceBranch],
        env
    );
}

/**
 * Get current branch name, or null if detached / no commits.
 */
export function getCurrentBranch(projectDir: string): string | null {
    if (!isGitRepo(projectDir)) return null;
    try {
        const out = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
            cwd: projectDir,
            encoding: 'utf-8'
        });
        if (out.status !== 0 || !out.stdout) return null;
        const branch = out.stdout.trim();
        return branch && branch !== 'HEAD' ? branch : null;
    } catch {
        return null;
    }
}

/**
 * Snapshot the workspace (.moteur/) to an orphan branch. Does not touch content history.
 * Creates the branch with a single commit containing only .moteur/. Caller can push the branch.
 */
export async function snapshotWorkspace(
    projectDir: string,
    message: string = `Workspace snapshot — ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`,
    author?: { name?: string; email?: string; id?: string }
): Promise<void> {
    if (!isGitRepo(projectDir)) return;
    const prevBranch = getCurrentBranch(projectDir);
    const { name, email } = safeAuthor(author ?? {});
    const env = {
        GIT_AUTHOR_NAME: name,
        GIT_AUTHOR_EMAIL: email,
        GIT_COMMITTER_NAME: name,
        GIT_COMMITTER_EMAIL: email
    };

    const moteurDir = path.join(projectDir, '.moteur');
    const hasWorkspace = existsSync(moteurDir);
    if (!hasWorkspace) {
        await fs.mkdir(moteurDir, { recursive: true });
        await fs.writeFile(
            path.join(moteurDir, '.keep'),
            '# Workspace store — comments, activity, radar, reviews, schedules. Gitignored on main.\n',
            'utf-8'
        );
    }

    try {
        git(projectDir, ['checkout', '--orphan', WORKSPACE_SNAPSHOT_BRANCH], env);
        try {
            git(projectDir, ['rm', '-rf', '--cached', '.'], env);
        } catch {
            // Orphan branch has empty index; nothing to rm
        }
        git(projectDir, ['add', '-f', '.moteur/'], env);
        for (const excluded of [WORKSPACE_SECRETS_PATH, WORKSPACE_CACHE_PATH]) {
            try {
                git(projectDir, ['reset', 'HEAD', '--', excluded], env);
            } catch {
                // may not exist or not be staged
            }
        }
        try {
            git(projectDir, ['diff', '--cached', '--quiet'], env);
        } catch {
            git(projectDir, ['commit', '-m', message], env);
        }
    } finally {
        if (prevBranch) {
            git(projectDir, ['checkout', prevBranch], env);
        } else {
            git(projectDir, ['checkout', '-b', 'main'], env);
        }
    }
}

/**
 * Restore .moteur/ from the workspace snapshot branch. Overwrites local .moteur/ with the branch contents.
 */
export async function restoreWorkspace(
    projectDir: string,
    fromBranch: string = WORKSPACE_SNAPSHOT_BRANCH
): Promise<void> {
    if (!isGitRepo(projectDir)) return;
    const prevBranch = getCurrentBranch(projectDir);
    const tmpDir = path.join(projectDir, '..', `.moteur-restore-${Date.now()}`);

    try {
        try {
            git(projectDir, ['checkout', fromBranch]);
        } catch {
            return;
        }
        const moteurSrc = path.join(projectDir, '.moteur');
        if (existsSync(moteurSrc)) await fs.cp(moteurSrc, tmpDir, { recursive: true });

        if (prevBranch) {
            git(projectDir, ['checkout', prevBranch]);
        } else {
            git(projectDir, ['checkout', 'main']);
        }

        const moteurDest = path.join(projectDir, '.moteur');
        if (existsSync(tmpDir)) {
            await fs.mkdir(moteurDest, { recursive: true });
            await fs.cp(tmpDir, moteurDest, { recursive: true });
            await fs.rm(tmpDir, { recursive: true, force: true });
        }
    } catch (e) {
        if (existsSync(tmpDir))
            await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        throw e;
    }
}

/**
 * Snapshot user-data/ to its own orphan branch. Does not touch content or workspace.
 */
export async function snapshotUserData(
    projectDir: string,
    message: string = `User data snapshot — ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`,
    author?: { name?: string; email?: string; id?: string }
): Promise<void> {
    if (!isGitRepo(projectDir)) return;
    const prevBranch = getCurrentBranch(projectDir);
    const { name, email } = safeAuthor(author ?? {});
    const env = {
        GIT_AUTHOR_NAME: name,
        GIT_AUTHOR_EMAIL: email,
        GIT_COMMITTER_NAME: name,
        GIT_COMMITTER_EMAIL: email
    };
    const userDataDir = path.join(projectDir, 'user-data');
    const hasUserData = existsSync(userDataDir);
    if (!hasUserData) {
        await fs.mkdir(userDataDir, { recursive: true });
        await fs.writeFile(
            path.join(userDataDir, '.keep'),
            '# User data store — form submissions, etc. Gitignored on main.\n',
            'utf-8'
        );
    }
    try {
        git(projectDir, ['checkout', '--orphan', USERDATA_SNAPSHOT_BRANCH], env);
        try {
            git(projectDir, ['rm', '-rf', '--cached', '.'], env);
        } catch {
            // Orphan branch has empty index
        }
        git(projectDir, ['add', 'user-data/'], env);
        try {
            git(projectDir, ['diff', '--cached', '--quiet'], env);
        } catch {
            git(projectDir, ['commit', '-m', message], env);
        }
    } finally {
        if (prevBranch) {
            git(projectDir, ['checkout', prevBranch], env);
        } else {
            git(projectDir, ['checkout', '-b', 'main'], env);
        }
    }
}

/**
 * Restore user-data/ from the userdata snapshot branch.
 */
export async function restoreUserData(
    projectDir: string,
    fromBranch: string = USERDATA_SNAPSHOT_BRANCH
): Promise<void> {
    if (!isGitRepo(projectDir)) return;
    const prevBranch = getCurrentBranch(projectDir);
    const tmpDir = path.join(projectDir, '..', `.userdata-restore-${Date.now()}`);

    try {
        try {
            git(projectDir, ['checkout', fromBranch]);
        } catch {
            return;
        }
        const src = path.join(projectDir, 'user-data');
        if (existsSync(src)) await fs.cp(src, tmpDir, { recursive: true });

        if (prevBranch) {
            git(projectDir, ['checkout', prevBranch]);
        } else {
            git(projectDir, ['checkout', 'main']);
        }

        const dest = path.join(projectDir, 'user-data');
        if (existsSync(tmpDir)) {
            await fs.mkdir(dest, { recursive: true });
            await fs.cp(tmpDir, dest, { recursive: true });
            await fs.rm(tmpDir, { recursive: true, force: true });
        }
    } catch (e) {
        if (existsSync(tmpDir))
            await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        throw e;
    }
}
