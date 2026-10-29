import { spawn, spawnSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { existsSync, readdirSync, readFileSync, rmSync } from 'fs';
import { gitAuthEnv } from '../gitCredentials.js';

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
function git(
    projectDir: string,
    args: string[],
    env?: Record<string, string>,
    maxBuffer = 256 * 1024 * 1024
): string {
    const fullEnv = { ...process.env, ...env };
    const r = spawnSync('git', args, {
        cwd: projectDir,
        encoding: 'utf-8',
        env: fullEnv,
        // A commit of thousands of files lists each one; Node's default 1 MB fails with ENOBUFS.
        maxBuffer
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

/** `gitAsync` as text: what most commands answer. The server keeps answering while Git works. */
async function run(
    projectDir: string,
    args: string[],
    env?: Record<string, string>
): Promise<string> {
    return (await gitAsync(projectDir, args, undefined, env)).toString('utf-8').trim();
}

const queues = new Map<string, Promise<unknown>>();

/**
 * One Git change at a time in a repository (two would meet on its index.lock); different
 * projects' repositories work side by side.
 */
function inRepo<T>(projectDir: string, work: () => Promise<T>): Promise<T> {
    const previous = queues.get(projectDir) ?? Promise.resolve();
    const next = previous.then(work, work);
    const settled = next.catch(() => undefined);
    queues.set(projectDir, settled);
    void settled.then(() => {
        if (queues.get(projectDir) === settled) queues.delete(projectDir);
    });
    return next;
}

/** Every repository's Git work done (tests clean up after it; shutting down waits for it). */
export async function gitIdle(): Promise<void> {
    while (queues.size) await Promise.all([...queues.values()]);
}

function authorEnv(author: GitAuthor | { name?: string; email?: string; id?: string }) {
    const { name, email } = safeAuthor(author);
    return {
        GIT_AUTHOR_NAME: name,
        GIT_AUTHOR_EMAIL: email,
        GIT_COMMITTER_NAME: name,
        GIT_COMMITTER_EMAIL: email
    };
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
 * Lock files Git leaves when it's stopped mid-command (a crash, a machine killed during a
 * commit). One left behind makes every later commit in the repository fail. Only for startup,
 * before any Git work of this process: removing a lock a running Git holds would be worse.
 * Returns the locks removed.
 */
export function removeStaleLocks(projectDir: string): string[] {
    const gitDir = path.join(projectDir, '.git');
    if (!existsSync(gitDir)) return [];
    const candidates = ['index.lock', 'HEAD.lock', 'config.lock', 'packed-refs.lock'];
    const headsDir = path.join(gitDir, 'refs', 'heads');
    if (existsSync(headsDir))
        for (const name of readdirSync(headsDir))
            if (name.endsWith('.lock')) candidates.push(path.join('refs', 'heads', name));
    const removed: string[] = [];
    for (const name of candidates) {
        const file = path.join(gitDir, name);
        if (!existsSync(file)) continue;
        rmSync(file, { force: true });
        removed.push(name);
    }
    return removed;
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
): Promise<string> {
    if (relativePaths.length === 0) return Promise.resolve('');
    const env = authorEnv(author);
    const normalized = relativePaths.map(p => p.replace(/\\/g, '/'));
    return inRepo(projectDir, async () => {
        // -A stages additions, modifications, and deletions for the given paths
        await run(projectDir, ['add', '-A', '--', ...normalized], env);
        if (await nothingStaged(projectDir, env)) return '';
        await run(projectDir, ['commit', '-m', message], env);
        return headCommit(projectDir);
    });
}

/** `git diff --cached --quiet`: exit 0 when nothing is staged, 1 when something is. */
async function nothingStaged(projectDir: string, env: Record<string, string>): Promise<boolean> {
    try {
        await run(projectDir, ['diff', '--cached', '--quiet'], env);
        return true;
    } catch (err) {
        if ((err as { status?: number }).status === 1) return false;
        throw err;
    }
}

/**
 * Stage all changes (including new and deleted files) and commit. Used e.g. after copying a project.
 */
export function addAllAndCommit(
    projectDir: string,
    message: string,
    author: GitAuthor | { name?: string; email?: string; id?: string }
): Promise<string> {
    const env = authorEnv(author);
    return inRepo(projectDir, async () => {
        await run(projectDir, ['add', '-A'], env);
        if (!(await nothingStaged(projectDir, env)))
            await run(projectDir, ['commit', '-m', message], env);
        return headCommit(projectDir);
    });
}

/**
 * The commit HEAD points at, read from .git as Git keeps it (a ref file, or packed-refs): asked
 * after every commit, and starting a process each time costs the server more than the commit.
 */
async function headCommit(projectDir: string): Promise<string> {
    const gitDir = path.join(projectDir, '.git');
    try {
        const head = (await fs.readFile(path.join(gitDir, 'HEAD'), 'utf-8')).trim();
        if (/^[0-9a-f]{40}$/.test(head)) return head;
        const ref = /^ref: (refs\/\S+)$/.exec(head)?.[1];
        if (ref && !ref.includes('..')) {
            const loose = await fs.readFile(path.join(gitDir, ref), 'utf-8').catch(() => '');
            if (/^[0-9a-f]{40}/.test(loose)) return loose.slice(0, 40);
            const packed = await fs
                .readFile(path.join(gitDir, 'packed-refs'), 'utf-8')
                .catch(() => '');
            const line = packed.split('\n').find(l => l.endsWith(` ${ref}`));
            if (line && /^[0-9a-f]{40} /.test(line)) return line.slice(0, 40);
        }
    } catch {
        /* Git says, below */
    }
    return run(projectDir, ['rev-parse', 'HEAD']);
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
        const out = git(
            projectDir,
            ['log', '-n', String(maxCount), '--format=%H%n%s%n%an%n%ae%n%aI'],
            undefined,
            1024 * 1024
        );
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
export async function getLog(
    projectDir: string,
    relativePath: string,
    maxCount = 50
): Promise<CommitInfo[]> {
    if (!isGitRepo(projectDir)) return [];
    const normalized = relativePath.replace(/\\/g, '/');
    try {
        // After the commits already waiting in this repository: history as the last save left it.
        const out = await inRepo(projectDir, () =>
            run(projectDir, [
                'log',
                '-n',
                String(maxCount),
                '--format=%H%n%s%n%an%n%ae%n%aI',
                '--',
                normalized
            ])
        );
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
export async function show(
    projectDir: string,
    rev: string,
    relativePath: string
): Promise<string | null> {
    if (!isGitRepo(projectDir)) return null;
    const normalized = relativePath.replace(/\\/g, '/');
    try {
        return await inRepo(projectDir, () =>
            run(projectDir, ['show', '--end-of-options', `${rev}:${normalized}`])
        );
    } catch {
        return null;
    }
}

/** Run git asynchronously and collect stdout (binary-safe). Rejects on a non-zero exit. */
function gitAsync(
    projectDir: string,
    args: string[],
    input?: string,
    env?: Record<string, string>
): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const child = spawn('git', args, {
            cwd: projectDir,
            ...(env && { env: { ...process.env, ...env } })
        });
        const out: Buffer[] = [];
        const err: Buffer[] = [];
        child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
        child.stderr.on('data', (chunk: Buffer) => err.push(chunk));
        child.on('error', reject);
        child.on('close', code => {
            if (code === 0) resolve(Buffer.concat(out));
            else
                reject(
                    Object.assign(
                        new Error(Buffer.concat(err).toString() || `git ${args[0]} failed`),
                        { status: code }
                    )
                );
        });
        // Git may exit before reading its input (EPIPE); 'close' above reports why.
        child.stdin.on('error', () => {});
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
        // Asked on every save: the repository's config says it, with no Git process to start.
        return /^\[remote "/m.test(readFileSync(path.join(projectDir, '.git', 'config'), 'utf-8'));
    } catch {
        return false;
    }
}

/**
 * Push to the remote now. False when it failed. Pushes take turns with each other, not with
 * commits: a push only reads what's committed (and moves origin's ref), so a save never waits on
 * the network, even in the same project.
 */
export function push(projectDir: string): Promise<boolean> {
    if (!isGitRepo(projectDir)) return Promise.resolve(false);
    return inRepo(`${projectDir}\0push`, async () => {
        try {
            // A branch never pushed has no upstream: the first push sets it, on origin.
            const env = pushEnv(projectDir);
            const upstream = await run(projectDir, [
                'rev-parse',
                '--abbrev-ref',
                '--symbolic-full-name',
                '@{u}'
            ]).catch(() => '');
            if (upstream) await run(projectDir, ['push'], env);
            else await run(projectDir, ['push', '--set-upstream', 'origin', 'HEAD'], env);
            return true;
        } catch {
            return false;
        }
    });
}

/** Quiet time after a commit before its push (`MOTEUR_GIT_PUSH_DELAY_MS`, default 2 s). */
function pushDelay(): number {
    const n = Number(process.env.MOTEUR_GIT_PUSH_DELAY_MS);
    return Number.isFinite(n) && n >= 0 ? n : 2000;
}

const scheduled = new Map<string, { timer: NodeJS.Timeout; done: ((pushed: boolean) => void)[] }>();

/**
 * Push soon, in the background: saves never wait on the network. Commits made meanwhile go in
 * the same push (one per quiet spell, not one per save). `done` hears whether it went.
 */
export function schedulePush(projectDir: string, done?: (pushed: boolean) => void): void {
    const waiting = scheduled.get(projectDir);
    if (waiting) clearTimeout(waiting.timer);
    const callbacks = [...(waiting?.done ?? []), ...(done ? [done] : [])];
    const timer = setTimeout(() => {
        scheduled.delete(projectDir);
        void push(projectDir).then(pushed => callbacks.forEach(cb => cb(pushed)));
    }, pushDelay());
    timer.unref?.();
    scheduled.set(projectDir, { timer, done: callbacks });
}

/** Pushes waiting their turn, sent now (shutting down, tests). */
export async function flushPushes(): Promise<void> {
    const waiting = [...scheduled.entries()];
    scheduled.clear();
    await Promise.all(
        waiting.map(async ([dir, { timer, done }]) => {
            clearTimeout(timer);
            const pushed = await push(dir);
            done.forEach(cb => cb(pushed));
        })
    );
}

/** A push never waits for a password prompt, and uses the project's token when it has one. */
function pushEnv(projectDir: string): Record<string, string> {
    return { GIT_TERMINAL_PROMPT: '0', ...gitAuthEnv(projectDir) };
}

/** The branch this one pushes to (`origin/main`), or null before its first push. */
function upstreamOf(projectDir: string): string | null {
    try {
        return (
            git(projectDir, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']) || null
        );
    } catch {
        return null;
    }
}

export interface GitStatus {
    /** The content branch, null before the first commit. */
    branch: string | null;
    /** Where it pushes (`origin`'s address), as Git has it. */
    remoteUrl: string | null;
    lastCommit: CommitInfo | null;
    /** Commits the remote doesn't have yet: 0 when all are there, null without a remote. */
    unpushed: number | null;
}

/** Where the content's history stands: its branch, last commit, and what the remote lacks. */
export function gitStatus(projectDir: string): GitStatus {
    const empty: GitStatus = { branch: null, remoteUrl: null, lastCommit: null, unpushed: null };
    if (!isGitRepo(projectDir)) return empty;
    let remoteUrl: string | null;
    try {
        remoteUrl = git(projectDir, ['remote', 'get-url', 'origin']) || null;
    } catch {
        remoteUrl = null;
    }
    const lastCommit = getRepoLog(projectDir, 1)[0] ?? null;
    let unpushed: number | null = null;
    if (remoteUrl && lastCommit) {
        const upstream = upstreamOf(projectDir);
        try {
            unpushed = Number(
                git(projectDir, ['rev-list', '--count', upstream ? `${upstream}..HEAD` : 'HEAD'])
            );
        } catch {
            unpushed = null;
        }
    }
    return { branch: getCurrentBranch(projectDir), remoteUrl, lastCommit, unpushed };
}

/**
 * Push a specific branch to remote. Used e.g. to push workspace snapshot branch.
 */
export function pushBranch(projectDir: string, branch: string): boolean {
    if (!isGitRepo(projectDir)) return false;
    try {
        git(projectDir, ['push', 'origin', branch], pushEnv(projectDir));
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
