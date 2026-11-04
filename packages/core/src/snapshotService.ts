/**
 * Snapshot service — wraps Git snapshot/restore for project state and user-data.
 * Use projectId; resolves project dir via pathUtils.
 */
import { projectDir } from './utils/pathUtils.js';
import {
    snapshotState as gitSnapshotState,
    restoreState as gitRestoreState,
    snapshotUserData as gitSnapshotUserData,
    restoreUserData as gitRestoreUserData,
    isGitRepo
} from './git/index.js';
import type { User } from '@moteurio/types/User.js';

function authorFromUser(user: { name?: string; email?: string; id?: string }) {
    return { name: user?.name, email: user?.email, id: user?.id };
}

export async function snapshotState(
    projectId: string,
    message?: string,
    user?: User
): Promise<void> {
    const dir = projectDir(projectId);
    if (!isGitRepo(dir)) return;
    await gitSnapshotState(dir, message, authorFromUser(user ?? {}));
}

export async function restoreState(projectId: string, fromBranch?: string): Promise<void> {
    const dir = projectDir(projectId);
    if (!isGitRepo(dir)) return;
    await gitRestoreState(dir, fromBranch);
}

export async function snapshotUserData(
    projectId: string,
    message?: string,
    user?: User
): Promise<void> {
    const dir = projectDir(projectId);
    if (!isGitRepo(dir)) return;
    await gitSnapshotUserData(dir, message, authorFromUser(user ?? {}));
}

export async function restoreUserData(projectId: string, fromBranch?: string): Promise<void> {
    const dir = projectDir(projectId);
    if (!isGitRepo(dir)) return;
    await gitRestoreUserData(dir, fromBranch);
}

export const SnapshotService = {
    snapshotState,
    restoreState,
    snapshotUserData,
    restoreUserData
};
