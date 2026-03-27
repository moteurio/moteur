import { Socket } from 'socket.io';
import { presenceStore } from '../PresenceStore.js';
import { presenceDebug } from '../presenceDebugLog.js';
import { emitFieldSnapshotOnRelease } from '../emitFieldSnapshotOnRelease.js';
import { clearScreenPatchRateLimit } from '../screenPatchRateLimit.js';
import { validateLeavePayload } from '../validate.js';
import { notifyPresenceRoomModeAfterMembershipChange } from './emitRoomMode.js';

export function registerLeaveRoom(socket: Socket): void {
    socket.on('leave', (payload: unknown) => {
        const projectId = validateLeavePayload(payload);
        if (!projectId) return;

        const prev = presenceStore.get(socket.id);
        if (prev?.projectId === projectId) {
            const previousEffective = presenceStore.getEffectiveCollaborationMode(projectId);
            const { userId, screenId } = prev;

            const locks = presenceStore.getLocks(projectId);
            const releasedFields: string[] = [];
            for (const [fieldPath, lockUserId] of Object.entries(locks)) {
                if (lockUserId === userId) {
                    releasedFields.push(fieldPath);
                    if (screenId) {
                        emitFieldSnapshotOnRelease(socket.to(projectId), {
                            projectId,
                            screenId,
                            fieldPath,
                            userId,
                            reason: 'leave-room'
                        });
                    }
                    presenceDebug('lock:release', {
                        projectId,
                        userId,
                        fieldPath,
                        reason: 'leave-room'
                    });
                    socket.to(projectId).emit('locks:update', {
                        type: 'unlock',
                        fieldPath,
                        userId
                    });
                }
            }
            presenceStore.unlockAllForUser(userId, projectId);
            presenceStore.remove(socket.id);
            clearScreenPatchRateLimit(socket.id);

            socket.to(projectId).emit('presence:change', {
                userId,
                changes: null
            });

            notifyPresenceRoomModeAfterMembershipChange(socket.nsp, projectId, previousEffective);

            console.log(`[presence] ${prev.name ?? userId} left room ${projectId}`);
            presenceDebug('room:leave', {
                projectId,
                userId,
                releasedLockCount: releasedFields.length,
                releasedFields: releasedFields.length > 0 ? releasedFields : undefined
            });
        }

        socket.leave(projectId);
    });
}
