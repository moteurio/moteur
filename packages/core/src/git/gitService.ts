import { spawn, spawnSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { existsSync, readdirSync, readFileSync, rmSync } from 'fs';
import { gitAuthEnv } from '../gitCredentials.js';

/** Paths excluded from the repository. Project state and user data are gitignored; content is tracked. */
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
 * Returns the installed Git version (such as `git version 2.43.0`), or null when Git can't be
 * run. Every project is a Git repository, so the API checks this at startup.
 */
export function gitVersion(command = 'git'): string | null {
    const r = spawnSync(command, ['--version'], { encoding: 'utf-8' });
    return !r.error && r.status === 0 ? r.stdout.trim() : null;
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
        // A commit of thousands of files lists every path in its output, which exceeds Node's default 1 MB buffer (ENOBUFS).
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

/** Runs `gitAsync` and returns its output as text, which is what most commands produce. The event loop stays free while Git runs. */
async function run(
    projectDir: string,
    args: string[],
    env?: Record<string, string>
): Promise<string> {
    return (await gitAsync(projectDir, args, undefined, env)).toString('utf-8').trim();
}

const queues = new Map<string, Promise<unknown>>();

/**
 * Runs one Git operation at a time per repository, because concurrent operations would conflict
 * on its index.lock. Different projects' repositories run in parallel.
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

/** Resolves when all queued Git work in every repository has finished. Tests use it before cleanup, and shutdown waits for it. */
export async function gitIdle(): Promise<void> {
    while (queues.size || handedOver.size) {
        await Promise.allSettled([
            ...queues.values(),
            ...[...handedOver.values()].flatMap(s => [...s])
        ]);
    }
}

/**
 * Background commits that are pending, per repository, from the moment a save hands them over
 * (before they reach the queue). A save doesn't wait for Git, so code that reads the latest
 * history must wait for these first.
 */
const handedOver = new Map<string, Set<Promise<unknown>>>();

/** Runs `work` in the background for this repository. Reads of its history wait for it to finish. */
export function inBackground(projectDir: string, work: Promise<unknown>): void {
    const set = handedOver.get(projectDir) ?? new Set();
    handedOver.set(projectDir, set);
    const tracked = work.catch(err =>
        console.error(
            `[moteur] A commit in the background failed (${projectDir}):`,
            err instanceof Error ? err.message : err
        )
    );
    set.add(tracked);
    void tracked.then(() => {
        set.delete(tracked);
        if (!set.size && handedOver.get(projectDir) === set) handedOver.delete(projectDir);
    });
}

/**
 * Resolves when everything handed to the background for this repository has been committed, so
 * the history matches the last save. Code that writes a file and commits it itself (publishing)
 * waits for this first, so that a save's background commit can't include the new content ahead
 * of it.
 */
export async function gitSettled(projectDir: string): Promise<void> {
    while (handedOver.get(projectDir)?.size)
        await Promise.allSettled([...handedOver.get(projectDir)!]);
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
        // A repository exists wherever .git exists.
        return existsSync(path.join(projectDir, '.git'));
    } catch {
        return false;
    }
}

/**
 * Removes lock files that Git leaves behind when it is stopped mid-command (a crash, or a
 * machine killed during a commit). A leftover lock makes every later commit in the repository
 * fail. Call it only at startup, before this process runs any Git work, because removing a lock
 * that a running Git holds would be worse. Returns the locks removed.
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
        // A path missing from disk is staged only if Git tracks it (a deletion to commit). Staging
        // a path Git never knew would make `git add` refuse the whole commit.
        const missing = normalized.filter(p => !existsSync(path.join(projectDir, p)));
        const known = missing.length
            ? new Set((await run(projectDir, ['ls-files', '--', ...missing])).split('\n'))
            : new Set<string>();
        const staged = normalized.filter(p => !missing.includes(p) || known.has(p));
        if (staged.length === 0) return '';
        // -A stages additions, modifications, and deletions for the given paths
        await run(projectDir, ['add', '-A', '--', ...staged], env);
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
 * Returns the commit HEAD points at, read directly from .git (a ref file, or packed-refs). It is
 * needed after every commit, and starting a Git process each time costs more than the commit.
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
        /* Fall through: the Git command below reports the problem. */
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
    await gitSettled(projectDir);
    try {
        // Wait for the commits already pending in this repository so the history matches the last save.
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
    // A commit hash is immutable, but HEAD or a branch name must wait for the pending saves to be committed.
    if (!/^[0-9a-f]{40}$/.test(rev)) await gitSettled(projectDir);
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
        // Git may exit before reading all of its input (EPIPE). The 'close' handler above reports why.
        child.stdin.on('error', () => {});
        child.stdin.end(input ?? '');
    });
}

/** Above this many files at one revision, list the revision's tree once instead of resolving each path separately. */
const LS_TREE_THRESHOLD = 64;

/** Returns the blob id of every file at a revision. */
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

    if (specs.some(spec => !/^[0-9a-f]{40}:/.test(spec))) await gitSettled(projectDir);
    const byRev = new Map<string, string[]>();
    for (const spec of specs) {
        const rev = spec.slice(0, spec.indexOf(':'));
        const list = byRev.get(rev);
        if (list) list.push(spec);
        else byRev.set(rev, [spec]);
    }
    // What to ask cat-file for each spec: a blob id, the spec itself, or nothing when the file is missing.
    const objects = new Map<string, string | null>(specs.map(spec => [spec, spec]));
    for (const [rev, revSpecs] of byRev) {
        if (revSpecs.length < LS_TREE_THRESHOLD) continue;
        let ids: Map<string, string>;
        try {
            ids = await blobIds(projectDir, rev);
        } catch {
            continue; // Unknown revision: report each spec as missing.
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
        // This runs on every save, so read the repository's config directly instead of starting a Git process.
        return /^\[remote "/m.test(readFileSync(path.join(projectDir, '.git', 'config'), 'utf-8'));
    } catch {
        return false;
    }
}

/**
 * Pushes to the remote immediately. Returns false when the push fails. Pushes are serialized
 * with each other but not with commits: a push only reads committed data (and moves origin's
 * ref), so a save never waits on the network, even in the same project.
 */
export function push(projectDir: string): Promise<boolean> {
    if (!isGitRepo(projectDir)) return Promise.resolve(false);
    return inRepo(`${projectDir}\0push`, async () => {
        try {
            // A branch that was never pushed has no upstream, so the first push sets it on origin.
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

/** How long to wait after a commit before pushing (`MOTEUR_GIT_PUSH_DELAY_MS`, default 2 s). */
function pushDelay(): number {
    const n = Number(process.env.MOTEUR_GIT_PUSH_DELAY_MS);
    return Number.isFinite(n) && n >= 0 ? n : 2000;
}

const scheduled = new Map<string, { timer: NodeJS.Timeout; done: ((pushed: boolean) => void)[] }>();

/**
 * Schedules a push in the background so saves never wait on the network. Commits made in the
 * meantime go out in the same push (one push per quiet period, not one per save). `done` is
 * called with whether the push succeeded.
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

/** Sends any scheduled pushes immediately (used when shutting down, and in tests). */
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

/** Environment for push commands: never wait for a password prompt, and use the project's token when it has one. */
function pushEnv(projectDir: string): Record<string, string> {
    return { GIT_TERMINAL_PROMPT: '0', ...gitAuthEnv(projectDir) };
}

/** The remote branch this branch pushes to (`origin/main`), or null before its first push. */
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
    /** The content branch, or null before the first commit. */
    branch: string | null;
    /** The address of `origin`, as Git has it configured. */
    remoteUrl: string | null;
    lastCommit: CommitInfo | null;
    /** Number of commits the remote doesn't have yet: 0 when it has all of them, null when there is no remote. */
    unpushed: number | null;
}

/** The state of the content history: its branch, last commit, and how many commits the remote lacks. */
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
 * Push a specific branch to remote. Used e.g. to push state snapshot branch.
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

export const STATE_SNAPSHOT_BRANCH = 'moteur-state-snapshots';
/** Separate orphan branch for user-data/ snapshots. Do not mix with project state. */
export const USERDATA_SNAPSHOT_BRANCH = 'moteur-userdata-snapshots';

const STATE_SECRETS_PATH = '.moteur/secrets.json';
/** Caches that can be rebuilt (the content index). They are never included in snapshots. */
const STATE_CACHE_PATH = '.moteur/cache/';

/**
 * List local branch names (content branches). Excludes state snapshot branch from default list when filterStateBranch is true.
 */
export function listBranches(projectDir: string, filterStateBranch: boolean = true): string[] {
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
        if (filterStateBranch) {
            return branches.filter(b => b !== STATE_SNAPSHOT_BRANCH);
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
 * Snapshot the project state (.moteur/) to an orphan branch. Does not touch content history.
 * Creates the branch with a single commit containing only .moteur/. Caller can push the branch.
 */
export async function snapshotState(
    projectDir: string,
    message: string = `State snapshot — ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`,
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
    const hasState = existsSync(moteurDir);
    if (!hasState) {
        await fs.mkdir(moteurDir, { recursive: true });
        await fs.writeFile(
            path.join(moteurDir, '.keep'),
            '# Project state — comments, activity, radar, reviews, schedules. Gitignored on main.\n',
            'utf-8'
        );
    }

    try {
        git(projectDir, ['checkout', '--orphan', STATE_SNAPSHOT_BRANCH], env);
        try {
            git(projectDir, ['rm', '-rf', '--cached', '.'], env);
        } catch {
            // Orphan branch has empty index; nothing to rm
        }
        git(projectDir, ['add', '-f', '.moteur/'], env);
        for (const excluded of [STATE_SECRETS_PATH, STATE_CACHE_PATH]) {
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
 * Restore .moteur/ from the state snapshot branch. Overwrites local .moteur/ with the branch contents.
 */
export async function restoreState(
    projectDir: string,
    fromBranch: string = STATE_SNAPSHOT_BRANCH
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
 * Snapshot user-data/ to its own orphan branch. Does not touch content or project state.
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
