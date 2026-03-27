import { Socket } from 'socket.io';
import { presenceStore } from '../PresenceStore.js';
import { presenceDebug } from '../presenceDebugLog.js';
import { emitFieldSnapshotOnRelease } from '../emitFieldSnapshotOnRelease.js';
import { clearScreenPatchRateLimit } from '../screenPatchRateLimit.js';
import { notifyPresenceRoomModeAfterMembershipChange } from './emitRoomMode.js';

export function registerDisconnect(socket: Socket) {
    socket.on('disconnect', () => {
        const prev = presenceStore.get(socket.id);
        if (!prev) return;

        const previousEffective = presenceStore.getEffectiveCollaborationMode(prev.projectId);
        const { projectId, userId, screenId } = prev;

        const locks = presenceStore.getLocks(projectId);
        const peers = socket.nsp.to(projectId).except(socket.id);
        const releasedFields: string[] = [];
        for (const [fieldPath, lockUserId] of Object.entries(locks)) {
            if (lockUserId === userId) {
                releasedFields.push(fieldPath);
                if (screenId) {
                    emitFieldSnapshotOnRelease(peers, {
                        projectId,
                        screenId,
                        fieldPath,
                        userId,
                        reason: 'disconnect'
                    });
                }
                presenceDebug('lock:release', {
                    projectId,
                    userId,
                    fieldPath,
                    reason: 'disconnect'
                });
                peers.emit('locks:update', {
                    type: 'unlock',
                    fieldPath,
                    userId
                });
            }
        }
        presenceStore.unlockAllForUser(userId, projectId);
        presenceStore.remove(socket.id);
        clearScreenPatchRateLimit(socket.id);

        console.log(`[presence] ${userId} disconnected from project ${projectId}`);
        presenceDebug('socket:disconnect', {
            projectId,
            userId,
            releasedLockCount: releasedFields.length,
            releasedFields: releasedFields.length > 0 ? releasedFields : undefined
        });

        peers.emit('presence:change', {
            userId,
            changes: null
        });

        notifyPresenceRoomModeAfterMembershipChange(socket.nsp, projectId, previousEffective);
    });
}
