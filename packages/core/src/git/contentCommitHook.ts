/**
 * Core behaviour: commit and optionally push when content is saved or deleted.
 * Gated by project.git.enabled (default true when git config is present).
 */
import { onEvent } from '../utils/eventBus.js';
import { getProjectById } from '../projects.js';
import { projectDir } from '../utils/pathUtils.js';
import { log, toActivityEvent } from '../activityLogger.js';
import { addAndCommit, GITIGNORE_LINES, hasRemote, isGitRepo, push } from './gitService.js';
import type { User } from '@moteurio/types/User.js';

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

    // A project without a remote keeps its history locally; there is nothing to push or report.
    if (!hasRemote(dir)) return;
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
