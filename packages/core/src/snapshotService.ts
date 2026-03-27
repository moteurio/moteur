/**
 * Snapshot service — wraps Git snapshot/restore for workspace and user-data.
 * Use projectId; resolves project dir via pathUtils.
 */
import { projectDir } from './utils/pathUtils.js';
import {
    snapshotWorkspace as gitSnapshotWorkspace,
    restoreWorkspace as gitRestoreWorkspace,
    snapshotUserData as gitSnapshotUserData,
    restoreUserData as gitRestoreUserData,
    isGitRepo
} from './git/index.js';
import type { User } from '@moteurio/types/User.js';

function authorFromUser(user: { name?: string; email?: string; id?: string }) {
    return { name: user?.name, email: user?.email, id: user?.id };
}

export async function snapshotWorkspace(
    projectId: string,
    message?: string,
    user?: User
): Promise<void> {
    const dir = projectDir(projectId);
    if (!isGitRepo(dir)) return;
    await gitSnapshotWorkspace(dir, message, authorFromUser(user ?? {}));
}

export async function restoreWorkspace(projectId: string, fromBranch?: string): Promise<void> {
    const dir = projectDir(projectId);
    if (!isGitRepo(dir)) return;
    await gitRestoreWorkspace(dir, fromBranch);
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
    snapshotWorkspace,
    restoreWorkspace,
    snapshotUserData,
    restoreUserData
};
