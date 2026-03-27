import type { ProjectSchema } from '@moteurio/types/Project.js';
import type { User } from '@moteurio/types/User.js';
import { projectDir } from './pathUtils.js';
import { initRepo, isGitRepo, addAllAndCommit, push, setRemoteOrigin } from '../git/index.js';

/** Git remote URL lives only under `project.git.remoteUrl`. */
export function getEffectiveGitRemoteUrl(project: ProjectSchema): string {
    return project.git?.remoteUrl?.trim() ?? '';
}

function isGitEnabled(project: ProjectSchema): boolean {
    return project.git?.enabled !== false;
}

function shouldBootstrapGitRepo(
    current: ProjectSchema,
    updated: ProjectSchema,
    patch: Partial<ProjectSchema>
): boolean {
    if (!isGitEnabled(updated)) return false;
    const prevRemote = getEffectiveGitRemoteUrl(current);
    const nextRemote = getEffectiveGitRemoteUrl(updated);
    const wasExplicitlyDisabled = current.git?.enabled === false;
    const nowEnabled = updated.git?.enabled !== false;
    const enabling = wasExplicitlyDisabled && nowEnabled;
    const patchEnables = patch.git?.enabled === true;
    const remoteAddedOrChanged =
        Boolean(nextRemote) && (nextRemote !== prevRemote || Boolean(!prevRemote && nextRemote));
    return Boolean(enabling || patchEnables || remoteAddedOrChanged);
}

/**
 * After project.json is saved: init repo if missing, initial commit of all tracked content,
 * and/or sync `origin` URL. Used from `updateProject`.
 */
export async function applyProjectGitSideEffects(
    current: ProjectSchema,
    updated: ProjectSchema,
    patch: Partial<ProjectSchema>,
    projectId: string,
    user: User
): Promise<void> {
    const dir = projectDir(projectId);
    const prevRemote = getEffectiveGitRemoteUrl(current);
    const nextRemote = getEffectiveGitRemoteUrl(updated);

    if (!isGitEnabled(updated)) {
        return;
    }

    if (!isGitRepo(dir)) {
        if (!shouldBootstrapGitRepo(current, updated, patch)) {
            return;
        }
        await initRepo(dir);
        addAllAndCommit(dir, `Initial repository — ${user.name ?? user.id}`, user);
        if (nextRemote) {
            try {
                setRemoteOrigin(dir, nextRemote);
                push(dir);
            } catch {
                /* push may fail without credentials */
            }
        }
        return;
    }

    if (nextRemote && nextRemote !== prevRemote) {
        try {
            setRemoteOrigin(dir, nextRemote);
            push(dir);
        } catch {
            /* non-fatal */
        }
    }
}
