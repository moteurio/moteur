/**
 * Core behaviour: commit and optionally push when content is saved or deleted.
 * Gated by project.git.enabled (default true when git config is present).
 */
import { onEvent } from '../utils/eventBus.js';
import { getProjectById } from '../projects.js';
import { projectDir } from '../utils/pathUtils.js';
import { log, toActivityEvent } from '../activityLogger.js';
import { addAndCommit, GITIGNORE_LINES, hasRemote, isGitRepo, schedulePush } from './gitService.js';
import type { User } from '@moteurio/types/User.js';
import { runGitCommitHooks } from '../plugins/gitHooks.js';
import { batchFor } from '../contentBatch.js';

type ContentEventPayload = { projectId: string; paths: string[]; message: string; user: User };

/**
 * Events may list workspace files (e.g. .moteur/reviews.json) next to content. Those are
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
    await commitContentChange(payload);
}

/** Commits (and pushes) a change now: what a content event does outside a batch. The commit, if any. */
export async function commitContentChange(
    payload: ContentEventPayload
): Promise<string | undefined> {
    const { projectId, message, user } = payload;
    const paths = trackedPaths(payload.paths);
    if (paths.length === 0) return;

    const project = await getProjectById(projectId);
    if (!project) return;
    if (project.git?.enabled === false) return;

    const dir = projectDir(projectId);
    if (!isGitRepo(dir)) return;

    let commitHash: string;
    try {
        commitHash = await addAndCommit(dir, paths, message, user);
    } catch (err) {
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
