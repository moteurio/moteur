/**
 * Commits, and optionally pushes, when content is saved or deleted.
 * Controlled by project.git.enabled (default true when a git config is present).
 */
import { onEvent } from '../utils/eventBus.js';
import { getProjectById } from '../projects.js';
import { projectDir } from '../utils/pathUtils.js';
import { log, toActivityEvent } from '../activityLogger.js';
import {
    addAndCommit,
    GITIGNORE_LINES,
    hasRemote,
    inBackground,
    isGitRepo,
    schedulePush
} from './gitService.js';
import type { User } from '@moteurio/types/User.js';
import { runGitCommitHooks } from '../plugins/gitHooks.js';
import { batchFor } from '../contentBatch.js';

type ContentEventPayload = { projectId: string; paths: string[]; message: string; user: User };

/**
 * Events may list project state files (for example .moteur/reviews.json) alongside content.
 * Those files are gitignored, and `git add` fails outright when given an ignored path, which
 * would leave the content change uncommitted too.
 */
function trackedPaths(paths: string[]): string[] {
    return paths.filter(p => {
        const normalized = p.replace(/\\/g, '/');
        return !GITIGNORE_LINES.some(ignored => normalized.startsWith(ignored));
    });
}

async function handleContentChange(payload: ContentEventPayload): Promise<void> {
    const batch = batchFor(payload.projectId);
    if (batch) {
        // Inside a batch, collect the paths so the whole batch is committed as one commit (or
        // discarded).
        for (const p of trackedPaths(payload.paths)) batch.paths.add(p.replace(/\\/g, '/'));
        return;
    }
    // The file on disk is the record of the save. Commit in the background so a save never waits
    // for Git (a commit takes about 0.4 s at 100,000 entries). Code that reads the latest history
    // waits for the commit, and a failed commit is retried with the next one.
    inBackground(projectDir(payload.projectId), handOver(payload));
}

type Waiting = ContentEventPayload & { done: () => void };

/** Saves waiting for their commit, per project, and the projects with a commit in progress. */
const waitingSaves = new Map<string, Waiting[]>();
const committing = new Set<string>();

/**
 * Queues a save's commit. With no commit in progress it commits immediately. Saves that arrive
 * while a commit runs wait and are committed together, so a busy project makes one commit per
 * author for a batch of saves instead of one per save. Resolves once this save is in history.
 */
function handOver(payload: ContentEventPayload): Promise<void> {
    const { projectId } = payload;
    return new Promise<void>(done => {
        const list = waitingSaves.get(projectId) ?? [];
        list.push({ ...payload, done });
        waitingSaves.set(projectId, list);
        if (committing.has(projectId)) return;
        committing.add(projectId);
        void (async () => {
            for (;;) {
                const batch = waitingSaves.get(projectId);
                if (!batch?.length) {
                    // Check and clear in the same tick, so a save arriving next starts a new run.
                    committing.delete(projectId);
                    return;
                }
                waitingSaves.delete(projectId);
                for (const group of byAuthor(batch)) {
                    try {
                        await commitContentChange(group);
                    } catch (err) {
                        console.error(
                            `[moteur] Saves of "${projectId}" could not be committed:`,
                            err instanceof Error ? err.message : err
                        );
                    }
                }
                for (const save of batch) save.done();
            }
        })();
    });
}

/** Formats the author suffix of a commit message (`… — Ada`, `… — Ada via Claude`). */
const attribution = (save: ContentEventPayload) =>
    `${save.user?.id ?? ''}\0${save.message.split(' — ').slice(1).join(' — ')}`;

/**
 * Groups waiting saves into one commit per author, in the order they arrived. A file saved by
 * several authors goes into the last author's commit, because the content on disk is theirs.
 */
function byAuthor(saves: ContentEventPayload[]): ContentEventPayload[] {
    const lastSaver = new Map<string, ContentEventPayload>();
    for (const save of saves) for (const p of save.paths) lastSaver.set(p, save);
    const groups = new Map<string, ContentEventPayload[]>();
    for (const save of saves) {
        const key = attribution(save);
        groups.set(key, [...(groups.get(key) ?? []), save]);
    }
    return [...groups.values()].map(group => {
        const paths = [...new Set(group.flatMap(s => s.paths.filter(p => lastSaver.get(p) === s)))];
        const first = group[0];
        if (group.length === 1) return { ...first, paths };
        const who = first.message.split(' — ').slice(1).join(' — ');
        const subject = `${group.length} saves${who ? ` — ${who}` : ''}`;
        return {
            ...first,
            paths,
            message: `${subject}\n\n${group.map(s => s.message).join('\n')}`
        };
    });
}

/**
 * Paths whose commit failed (for example a full disk or a lock), per project. They are saved on
 * disk but not in history. The project's next commit includes them, so a failure causes a delay
 * rather than a lost change.
 */
const uncommitted = new Map<string, Set<string>>();

/** Commits (and pushes) a change immediately, as a content event does outside a batch. Returns the commit, if any. */
export async function commitContentChange(
    payload: ContentEventPayload
): Promise<string | undefined> {
    const { projectId, message, user } = payload;
    const waiting = uncommitted.get(projectId);
    const paths = [...new Set([...trackedPaths(payload.paths), ...(waiting ?? [])])];
    if (paths.length === 0) return;

    const project = await getProjectById(projectId);
    if (!project) return;
    if (project.git?.enabled === false) return;

    const dir = projectDir(projectId);
    if (!isGitRepo(dir)) return;

    let commitHash: string;
    try {
        commitHash = await addAndCommit(dir, paths, message, user);
        uncommitted.delete(projectId);
    } catch (err) {
        uncommitted.set(projectId, new Set(paths));
        console.warn(
            `[Moteur] Git commit error for project "${projectId}":`,
            err instanceof Error ? err.message : err
        );
        log(
            toActivityEvent(projectId, 'git', 'repo', 'git_commit_failed', user, undefined, {
                error: err instanceof Error ? err.message : String(err),
                paths,
                message
            })
        );
        return;
    }

    if (commitHash) {
        log(
            toActivityEvent(projectId, 'git', 'repo', 'git_committed', user, undefined, {
                commit: commitHash,
                paths,
                message
            })
        );
        await runGitCommitHooks({ projectId, paths, message, user, commitHash });
    }

    // A project without a remote keeps its history locally, so there is nothing to push or report.
    if (!hasRemote(dir)) return commitHash || undefined;
    // Push in the background, together with any commits made shortly after, so the save doesn't
    // wait on the network.
    schedulePush(dir, pushed => {
        if (pushed) return;
        console.warn(
            `[Moteur] Git push skipped or failed for project "${projectId}" (no remote, auth, or network).`
        );
        log(
            toActivityEvent(projectId, 'git', 'repo', 'git_push_failed', user, undefined, {
                paths,
                message,
                reason: 'push_skipped_or_failed'
            })
        );
    });
    return commitHash || undefined;
}

export function registerContentCommitHook(): void {
    onEvent('content.saved', (payload: ContentEventPayload) => handleContentChange(payload));
    onEvent('content.deleted', (payload: ContentEventPayload) => handleContentChange(payload));
}
