import type { Namespace } from 'socket.io';
import type { Socket } from 'socket.io';
import type { CollaborationMode } from '@moteurio/types/Presence';
import { presenceStore } from '../PresenceStore.js';

function applyExclusiveToSharedLockReset(nsp: Namespace, projectId: string): void {
    presenceStore.clearFieldLocksForProject(projectId);
    nsp.to(projectId).emit('locks:sync', { locks: {} });
}

/** After join / re-join: tell this socket the mode; notify peers if effective mode changed. */
export function notifyPresenceRoomModeForJoin(
    socket: Socket,
    projectId: string,
    previousEffective: CollaborationMode
): void {
    const mode = presenceStore.getEffectiveCollaborationMode(projectId);
    socket.emit('presence:roomMode', { mode });

    if (previousEffective === 'exclusive' && mode === 'shared') {
        applyExclusiveToSharedLockReset(socket.nsp, projectId);
    }
    if (previousEffective !== mode) {
        socket.to(projectId).emit('presence:roomMode', { mode });
    }
}

/** After a member leaves or disconnects (already removed from presence store). */
export function notifyPresenceRoomModeAfterMembershipChange(
    nsp: Namespace,
    projectId: string,
    previousEffective: CollaborationMode
): void {
    const mode = presenceStore.getEffectiveCollaborationMode(projectId);
    if (previousEffective === 'exclusive' && mode === 'shared') {
        applyExclusiveToSharedLockReset(nsp, projectId);
    }
    if (previousEffective !== mode) {
        nsp.to(projectId).emit('presence:roomMode', { mode });
    }
}
