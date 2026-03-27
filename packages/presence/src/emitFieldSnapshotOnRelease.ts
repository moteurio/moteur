import { screenEphemeralStore } from './ScreenEphemeralStore.js';
import { presenceDebug } from './presenceDebugLog.js';

export interface FieldSnapshotReleaseContext {
    projectId: string;
    screenId: string;
    fieldPath: string;
    userId: string;
    reason: string;
}

/** Room-scoped emitter (`socket.to(projectId)` or `nsp.to(projectId).except(id)`). */
export interface PresenceRoomEmitter {
    emit(ev: string, ...args: unknown[]): void;
}

/**
 * Broadcasts current LWW value for one field so peers stay in sync when a lock is released
 * (blur, field switch, leave, disconnect).
 */
export function emitFieldSnapshotOnRelease(
    toRoom: PresenceRoomEmitter,
    ctx: FieldSnapshotReleaseContext
): void {
    const { projectId, screenId, fieldPath, userId, reason } = ctx;
    const value = screenEphemeralStore.getField(screenId, fieldPath);
    presenceDebug('field:release', {
        projectId,
        userId,
        screenId,
        fieldPath,
        reason,
        hasValue: value !== undefined
    });
    toRoom.emit('screen:change', {
        screenId,
        fields: { [fieldPath]: value === undefined ? '' : value },
        ui: {},
        originUserId: userId
    });
}
