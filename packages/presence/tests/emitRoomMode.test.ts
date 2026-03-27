import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Socket } from 'socket.io';
import {
    notifyPresenceRoomModeForJoin,
    notifyPresenceRoomModeAfterMembershipChange
} from '../src/events/emitRoomMode';
import { presenceStore } from '../src/PresenceStore';

const P = 'proj-room-mode';

describe('emitRoomMode', () => {
    beforeEach(() => {
        presenceStore.remove('s1');
        presenceStore.remove('s2');
        presenceStore.clearFieldLocksForProject(P);
    });

    it('notifyPresenceRoomModeForJoin tells socket current exclusive mode', () => {
        const selfEmit = vi.fn();
        const roomEmit = vi.fn();
        const nspTo = vi.fn(() => ({ emit: vi.fn() }));
        const socket = {
            id: 's1',
            emit: selfEmit,
            to: vi.fn(() => ({ emit: roomEmit })),
            nsp: { to: nspTo }
        } as unknown as Socket;

        presenceStore.update('s1', 'u1', 'A', P, { collaborationMode: 'exclusive' });
        notifyPresenceRoomModeForJoin(socket, P, 'shared');

        expect(selfEmit).toHaveBeenCalledWith('presence:roomMode', { mode: 'exclusive' });
        expect(roomEmit).toHaveBeenCalledWith('presence:roomMode', { mode: 'exclusive' });
    });

    it('notifyPresenceRoomModeAfterMembershipChange clears locks when exclusive becomes shared', () => {
        const emit = vi.fn();
        const nsp = {
            to: vi.fn(() => ({ emit }))
        };

        presenceStore.update('s1', 'u1', 'A', P, { collaborationMode: 'exclusive' });
        presenceStore.tryLockField(P, 'f1', 'u1');

        presenceStore.remove('s1');

        notifyPresenceRoomModeAfterMembershipChange(nsp as never, P, 'exclusive');

        expect(emit).toHaveBeenCalledWith('locks:sync', { locks: {} });
        expect(emit).toHaveBeenCalledWith('presence:roomMode', { mode: 'shared' });
    });
});
