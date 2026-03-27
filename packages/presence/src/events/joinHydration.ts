import type { Socket } from 'socket.io';
import { presenceStore } from '../PresenceStore.js';
import { screenEphemeralStore } from '../ScreenEphemeralStore.js';

/**
 * Sends `screen:sync` (ephemeral fields + ui), `presence:sync`, and `locks:sync`.
 * Call `notifyPresenceRoomModeForJoin` after hydration when joining / re-joining.
 */
export function emitJoinHydrationToSocket(
    socket: Socket,
    projectId: string,
    screenId: string | undefined
): void {
    if (screenId) {
        const fields = screenEphemeralStore.getFieldsRecord(screenId);
        const ui = screenEphemeralStore.getUiRecord(screenId);
        if (Object.keys(fields).length > 0 || Object.keys(ui).length > 0) {
            socket.emit('screen:sync', { screenId, fields, ui });
        }
    }
    socket.emit('presence:sync', {
        users: presenceStore.getByProject(projectId)
    });
    socket.emit('locks:sync', {
        locks: presenceStore.getLocks(projectId)
    });
}
