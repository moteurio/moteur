/**
 * Imports as jobs: started, followed (progress), and, when they wait for it, approved. A job is
 * kept in the project's workspace (.moteur/imports.json), the last few of them.
 */
import { randomUUID } from 'crypto';
import type { User } from '@moteurio/types/User.js';
import type { ImportBundle, ImportJob } from '@moteurio/types/Import.js';
import { needsApproval } from '@moteurio/types';
import { read, write } from '../utils/workspaceStore.js';
import { restoreProjectFile } from '../utils/projectStorage.js';
import { projectDir } from '../utils/pathUtils.js';
import { show } from '../git/gitService.js';
import { getProject } from '../projects.js';
import { assertNotReviewOnly, assertProjectAdmin } from '../contentAccess.js';
import { afterImport, countItems, importBundle, publishImport } from './importBundle.js';

const KEY = '.moteur/imports.json';
const KEEP = 30;

/** A job as kept: with the files it changed so far, to undo them if the server stops mid-way. */
type StoredJob = ImportJob & { touched?: string[] };

/** Jobs running in this process. One still "running" in the file but not here was cut short. */
const running = new Map<string, Promise<ImportJob>>();
/** Imports being approved right now. */
const approving = new Set<string>();
const queues = new Map<string, Promise<unknown>>();

/** One change to a project's jobs at a time. */
function change<T>(projectId: string, work: (jobs: StoredJob[]) => T | Promise<T>): Promise<T> {
    const run = (queues.get(projectId) ?? Promise.resolve()).then(async () => {
        const jobs = await read<StoredJob[]>(projectId, KEY, []);
        const out = await work(jobs);
        await write(projectId, KEY, jobs.slice(-KEEP));
        return out;
    });
    queues.set(
        projectId,
        run.catch(() => undefined)
    );
    return run;
}

const shown = ({ touched: _t, ...job }: StoredJob): ImportJob => job;

async function save(projectId: string, id: string, patch: Partial<StoredJob>): Promise<void> {
    await change(projectId, jobs => {
        const job = jobs.find(j => j.id === id);
        if (job) Object.assign(job, patch);
    });
}

/** A job the server stopped during: its files back as they were, and marked failed. */
async function recover(projectId: string, job: StoredJob): Promise<void> {
    const dir = projectDir(projectId);
    for (const key of job.touched ?? []) {
        if (key === 'assets.json') continue;
        await restoreProjectFile(projectId, key, show(dir, 'HEAD', key)).catch(() => undefined);
    }
    Object.assign(job, {
        status: 'failed',
        finishedAt: new Date().toISOString(),
        issues: [{ path: '', message: 'The server stopped during the import: nothing was kept.' }],
        touched: []
    });
}

/** Starts an import; the job is returned at once, and `finished` when it ends. */
export async function startImport(
    user: User,
    projectId: string,
    bundle: ImportBundle,
    options: { dryRun?: boolean } = {}
): Promise<{ job: ImportJob; finished: Promise<ImportJob> }> {
    await getProject(user, projectId);
    assertProjectAdmin(user, 'import');
    const job: StoredJob = {
        id: randomUUID(),
        projectId,
        status: 'running',
        dryRun: options.dryRun === true,
        createdAt: new Date().toISOString(),
        by: { id: user.id, name: user.name, ...(user.agent && { agent: user.agent.name }) },
        progress: { done: 0, total: countItems(bundle) },
        items: [],
        issues: []
    };
    await change(projectId, jobs => void jobs.push(job));

    // Progress is written now and then, not on every item.
    let lastWrite = 0;
    const finished = (async () => {
        const outcome = await importBundle(user, projectId, bundle, {
            dryRun: job.dryRun,
            onProgress: (done, total) => {
                job.progress = { done, total };
            },
            onTouched: paths => {
                if (Date.now() - lastWrite < 500 || job.dryRun) return;
                lastWrite = Date.now();
                void save(projectId, job.id, { progress: job.progress, touched: paths });
            }
        }).catch(err => ({
            status: 'failed' as const,
            dryRun: job.dryRun,
            items: [],
            issues: [{ path: '', message: err instanceof Error ? err.message : String(err) }]
        }));
        const done: Partial<StoredJob> = {
            ...outcome,
            progress: { done: job.progress.total, total: job.progress.total },
            finishedAt: new Date().toISOString(),
            touched: []
        };
        await save(projectId, job.id, done);
        running.delete(job.id);
        return shown({ ...job, ...done });
    })();
    running.set(job.id, finished);
    return { job: shown(job), finished };
}

/** A project's imports, newest first. */
export async function listImports(projectId: string): Promise<ImportJob[]> {
    return change(projectId, async jobs => {
        for (const job of jobs)
            if (job.status === 'running' && !running.has(job.id)) await recover(projectId, job);
        return [...jobs].reverse().map(shown);
    });
}

export async function getImport(projectId: string, id: string): Promise<ImportJob | null> {
    return (await listImports(projectId)).find(j => j.id === id) ?? null;
}

/**
 * A person puts a waiting import live: its pages and entries are published. An agent, or anyone
 * who needs approval themselves, can't.
 */
export async function approveImport(user: User, projectId: string, id: string): Promise<ImportJob> {
    const project = await getProject(user, projectId);
    assertProjectAdmin(user, 'approve an import');
    assertNotReviewOnly(user, 'approve an import');
    // One approval at a time: a second click doesn't publish it twice.
    if (approving.has(id))
        throw Object.assign(new Error('This import is already being approved.'), {
            statusCode: 409
        });
    approving.add(id);
    try {
        return await approveWaitingImport(user, project, projectId, id);
    } finally {
        approving.delete(id);
    }
}

async function approveWaitingImport(
    user: User,
    project: Awaited<ReturnType<typeof getProject>>,
    projectId: string,
    id: string
): Promise<ImportJob> {
    const job = await getImport(projectId, id);
    if (!job) throw Object.assign(new Error('No such import.'), { statusCode: 404 });
    if (job.status !== 'awaiting_approval' || !job.toPublish)
        throw Object.assign(new Error('This import is not waiting for approval.'), {
            statusCode: 409
        });
    if (needsApproval(user, project))
        throw Object.assign(
            new Error(
                user.agent
                    ? 'An agent can’t approve an import: a person does.'
                    : 'Only someone who can publish approves an import.'
            ),
            { statusCode: 403 }
        );
    const issues = await publishImport(user, projectId, job.toPublish);
    await afterImport(projectId, job.items, job.commit);
    const patch: Partial<StoredJob> = {
        status: 'done',
        issues,
        approvedBy: { id: user.id, name: user.name },
        finishedAt: new Date().toISOString()
    };
    await save(projectId, id, patch);
    return { ...job, ...patch };
}
