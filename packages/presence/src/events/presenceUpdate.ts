import { Socket } from 'socket.io';
import { presenceStore } from '../PresenceStore.js';
import { validatePresenceUpdate } from '../validate.js';
import { presenceDebug } from '../presenceDebugLog.js';
import { emitFieldSnapshotOnRelease } from '../emitFieldSnapshotOnRelease.js';
import { notifyPresenceRoomModeForJoin } from './emitRoomMode.js';

function emitFieldReleaseIfScreen(
    socket: Socket,
    projectId: string,
    screenId: string | undefined,
    fieldPath: string,
    userId: string,
    reason: string
): void {
    if (!screenId || !fieldPath) return;
    emitFieldSnapshotOnRelease(socket.to(projectId), {
        projectId,
        screenId,
        fieldPath,
        userId,
        reason
    });
}

/** Strip heavy keys before broadcasting presence deltas. */
function sanitizePresenceBroadcast(update: Record<string, unknown>): Record<string, unknown> {
    const { textPreview: _t, ...rest } = update;
    return rest;
}

export function registerPresenceUpdate(socket: Socket) {
    socket.on('presence:update', (payload: unknown) => {
        const payloadKeys =
            payload && typeof payload === 'object' && payload !== null
                ? Object.keys(payload as object)
                : [];

        const user = socket.data.user;
        if (!user?.userId || !user.name) {
            presenceDebug('update:rejected_no_user', { socketId: socket.id, payloadKeys });
            console.warn(`[presence] Invalid presence update from socket ${socket.id}`);
            return;
        }

        const update = validatePresenceUpdate(payload);
        if (update === null) {
            presenceDebug('update:invalid_payload', {
                socketId: socket.id,
                userId: user.userId,
                payloadKeys
            });
            console.warn(`[presence] Invalid presence update payload from socket ${socket.id}`);
            return;
        }

        const prev = presenceStore.get(socket.id);
        const projectId = prev?.projectId;

        if (!projectId) {
            presenceDebug('update:no_project', {
                socketId: socket.id,
                userId: user.userId,
                payloadKeys,
                hint: 'Client must emit `join` with { projectId } before presence:update.'
            });
            console.warn(`[presence] Missing projectId for socket ${socket.id}`);
            return;
        }

        const raw =
            payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
        const fieldPathTouched = 'fieldPath' in raw;
        const overlayIdTouched = 'overlayId' in raw;
        const collaborationTouched = 'collaborationMode' in raw;

        const previousEffective = collaborationTouched
            ? presenceStore.getEffectiveCollaborationMode(projectId)
            : undefined;

        const screenId = prev?.screenId ?? update.screenId;
        const prevField = prev?.fieldPath;
        const nextField = update.fieldPath;

        const exclusive = presenceStore.getEffectiveCollaborationMode(projectId) === 'exclusive';

        let effectiveUpdate: typeof update = update;

        if (exclusive) {
            if (fieldPathTouched && nextField && nextField !== prevField) {
                const acquired = presenceStore.tryLockField(projectId, nextField, user.userId);
                if (!acquired) {
                    const holder = presenceStore.getLocks(projectId)[nextField];
                    presenceDebug('lock:denied', {
                        projectId,
                        userId: user.userId,
                        socketId: socket.id,
                        fieldPath: nextField,
                        heldByUserId: holder
                    });
                    socket.emit('lock:denied', {
                        fieldPath: nextField,
                        heldByUserId: holder
                    });
                    effectiveUpdate = { ...update };
                    delete effectiveUpdate.fieldPath;
                } else {
                    if (prevField) {
                        emitFieldReleaseIfScreen(
                            socket,
                            projectId,
                            screenId,
                            prevField,
                            user.userId,
                            'switch-field'
                        );
                        presenceStore.unlockField(projectId, prevField, user.userId);
                        presenceDebug('lock:release', {
                            projectId,
                            userId: user.userId,
                            fieldPath: prevField,
                            reason: 'switch-field'
                        });
                        socket.to(projectId).emit('locks:update', {
                            type: 'unlock',
                            fieldPath: prevField,
                            userId: user.userId
                        });
                    }
                    presenceDebug('lock:acquire', {
                        projectId,
                        userId: user.userId,
                        socketId: socket.id,
                        fieldPath: nextField
                    });
                    socket.to(projectId).emit('locks:update', {
                        type: 'lock',
                        fieldPath: nextField,
                        userId: user.userId
                    });
                }
            } else if (fieldPathTouched && !nextField && prevField) {
                emitFieldReleaseIfScreen(
                    socket,
                    projectId,
                    screenId,
                    prevField,
                    user.userId,
                    'blur-clear'
                );
                presenceStore.unlockField(projectId, prevField, user.userId);
                presenceDebug('lock:release', {
                    projectId,
                    userId: user.userId,
                    fieldPath: prevField,
                    reason: 'blur-clear'
                });
                socket.to(projectId).emit('locks:update', {
                    type: 'unlock',
                    fieldPath: prevField,
                    userId: user.userId
                });
            }
        } else if (fieldPathTouched && !nextField && prevField) {
            emitFieldReleaseIfScreen(
                socket,
                projectId,
                screenId,
                prevField,
                user.userId,
                'blur-clear-shared'
            );
            presenceStore.unlockField(projectId, prevField, user.userId);
        }

        const nowPresence = presenceStore.update(
            socket.id,
            user.userId,
            user.name,
            projectId,
            effectiveUpdate
        );

        if (collaborationTouched && previousEffective !== undefined) {
            notifyPresenceRoomModeForJoin(socket, projectId, previousEffective);
        }

        if (
            Object.prototype.hasOwnProperty.call(effectiveUpdate, 'pointerPulse') &&
            typeof effectiveUpdate.pointerPulse === 'number'
        ) {
            presenceDebug('pointer:click', {
                projectId,
                userId: user.userId,
                socketId: socket.id,
                pulse: effectiveUpdate.pointerPulse,
                screenId: nowPresence.screenId
            });
        }

        const broadcast = sanitizePresenceBroadcast(effectiveUpdate as Record<string, unknown>);
        if (fieldPathTouched) {
            (broadcast as { fieldPath?: string | null }).fieldPath = nowPresence.fieldPath ?? null;
        }
        if (overlayIdTouched) {
            (broadcast as { overlayId?: string | null }).overlayId = nowPresence.overlayId ?? null;
        }
        (broadcast as { pointerPulse?: number | null }).pointerPulse =
            nowPresence.pointerPulse ?? null;
        if (collaborationTouched) {
            (broadcast as { collaborationMode?: string | null }).collaborationMode =
                nowPresence.collaborationMode ?? null;
        }
        if (Object.keys(broadcast).length > 0) {
            socket.to(projectId).emit('presence:change', {
                userId: user.userId,
                changes: broadcast
            });
        }
    });
}
