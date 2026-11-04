/**
 * Core behaviour: commit and optionally push when content is saved or deleted.
 * Gated by project.git.enabled (default true when git config is present).
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
 * Events may list project state files (e.g. .moteur/reviews.json) next to content. Those are
 * gitignored, and `git add` fails outright when given an ignored path, which would leave the
 * content change uncommitted too.
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
        // Held: the batch is committed as one (or undone).
        for (const p of trackedPaths(payload.paths)) batch.paths.add(p.replace(/\\/g, '/'));
        return;
    }
    // The save is on disk, which is its record: its commit follows in the background, so a save
    // never waits for Git (a commit grows with the project: 0.4 s at 100,000 entries). What reads
    // the latest history waits for it; a failed commit is taken along by the next one.
    inBackground(projectDir(payload.projectId), handOver(payload));
}

type Waiting = ContentEventPayload & { done: () => void };

/** Saves waiting for their commit, per project, and the projects whose commits are under way. */
const waitingSaves = new Map<string, Waiting[]>();
const committing = new Set<string>();

/**
 * A save's commit, in turn. With nothing under way it commits at once; saves that arrive while a
 * commit runs wait, then go in together, so a busy project makes one commit per author for a
 * batch of saves instead of one each. Resolves once this save is in history.
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
                    // Checked and cleared in the same turn: a save arriving next starts a new run.
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

/** Who a commit is by, as its message says it (`… — Ada`, `… — Ada via Claude`). */
const attribution = (save: ContentEventPayload) =>
    `${save.user?.id ?? ''}\0${save.message.split(' — ').slice(1).join(' — ')}`;

/**
 * Waiting saves as one commit per author, in the order they came. A file saved by several goes
 * with the last of them: what is on disk is theirs.
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
 * Paths a commit failed for (a full disk, a lock), per project: saved on disk but not in history.
 * The project's next commit takes them along, so a failure costs a delay, not a lost change.
 */
const uncommitted = new Map<string, Set<string>>();

/** Commits (and pushes) a change now: what a content event does outside a batch. The commit, if any. */
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

    // A project without a remote keeps its history locally; there is nothing to push or report.
    if (!hasRemote(dir)) return commitHash || undefined;
    // Pushed in the background, with any commits that follow soon: the save doesn't wait on it.
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
