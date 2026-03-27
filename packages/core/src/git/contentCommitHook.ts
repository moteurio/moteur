/**
 * Core behaviour: commit and optionally push when content is saved or deleted.
 * Gated by project.git.enabled (default true when git config is present).
 */
import { onEvent } from '../utils/eventBus.js';
import { getProjectById } from '../projects.js';
import { projectDir } from '../utils/pathUtils.js';
import { log, toActivityEvent } from '../activityLogger.js';
import { addAndCommit, isGitRepo, push } from './gitService.js';
import type { User } from '@moteurio/types/User.js';

type ContentEventPayload = { projectId: string; paths: string[]; message: string; user: User };

async function handleContentChange(payload: ContentEventPayload): Promise<void> {
    const { projectId, paths, message, user } = payload;
    if (paths.length === 0) return;

    const project = await getProjectById(projectId);
    if (!project) return;
    if (project.git?.enabled === false) return;

    const dir = projectDir(projectId);
    if (!isGitRepo(dir)) return;

    let commitHash: string;
    try {
        commitHash = addAndCommit(dir, paths, message, user);
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
    }

    const pushed = push(dir);
    if (!pushed) {
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
    }
}

export function registerContentCommitHook(): void {
    onEvent('content.saved', (payload: ContentEventPayload) => handleContentChange(payload));
    onEvent('content.deleted', (payload: ContentEventPayload) => handleContentChange(payload));
}
