import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Socket } from 'socket.io';
import { registerPresenceUpdate } from '../src/events/presenceUpdate';
import { presenceStore } from '../src/PresenceStore';

const SOCKET_ID = 'sock-presence-update-test';
const USER_ID = 'u-presence-draft';
const PROJECT_ID = 'proj-presence-draft';
const SCREEN_ID = 'models/demo/entries/e1';

describe('registerPresenceUpdate', () => {
    let presenceHandler: ((payload: unknown) => void) | undefined;
    const roomEmit = vi.fn();

    beforeEach(() => {
        presenceHandler = undefined;
        roomEmit.mockReset();
        presenceStore.unlockAllForUser(USER_ID, PROJECT_ID);
        presenceStore.remove(SOCKET_ID);
    });

    function connectHandler(): (payload: unknown) => void {
        const socket = {
            id: SOCKET_ID,
            data: { user: { userId: USER_ID, name: 'Alice' } },
            on(event: string, fn: (p: unknown) => void) {
                if (event === 'presence:update') presenceHandler = fn;
            },
            to: vi.fn(() => ({ emit: roomEmit })),
            nsp: { to: vi.fn(() => ({ emit: vi.fn() })) },
            emit: vi.fn()
        } as unknown as Socket;

        registerPresenceUpdate(socket);
        if (!presenceHandler) throw new Error('presence:update handler not registered');
        return presenceHandler;
    }

    it('in shared mode does not acquire field locks on focus', () => {
        const handler = connectHandler();
        presenceStore.update(SOCKET_ID, USER_ID, 'Alice', PROJECT_ID, { screenId: SCREEN_ID });
        handler({ fieldPath: 'entry:e1:title' });
        expect(presenceStore.getLocks(PROJECT_ID)).toEqual({});
    });

    it('in exclusive mode acquires lock and emits locks:update', () => {
        const handler = connectHandler();
        presenceStore.update(SOCKET_ID, USER_ID, 'Alice', PROJECT_ID, {
            screenId: SCREEN_ID,
            collaborationMode: 'exclusive'
        });
        roomEmit.mockClear();
        handler({ fieldPath: 'entry:e1:title' });
        expect(presenceStore.getLocks(PROJECT_ID)).toEqual({ 'entry:e1:title': USER_ID });
        expect(roomEmit).toHaveBeenCalledWith(
            'locks:update',
            expect.objectContaining({ type: 'lock', fieldPath: 'entry:e1:title', userId: USER_ID })
        );
    });

    it('in exclusive mode emits lock:denied when another user holds the field', () => {
        connectHandler();
        presenceStore.update(SOCKET_ID, USER_ID, 'Alice', PROJECT_ID, {
            screenId: SCREEN_ID,
            collaborationMode: 'exclusive'
        });
        presenceStore.tryLockField(PROJECT_ID, 'entry:e1:title', 'someone-else');

        const socketEmit = vi.fn();
        const socket = {
            id: SOCKET_ID,
            data: { user: { userId: USER_ID, name: 'Alice' } },
            on(event: string, fn: (p: unknown) => void) {
                if (event === 'presence:update') presenceHandler = fn;
            },
            to: vi.fn(() => ({ emit: roomEmit })),
            nsp: { to: vi.fn(() => ({ emit: vi.fn() })) },
            emit: socketEmit
        } as unknown as Socket;
        registerPresenceUpdate(socket);
        presenceHandler!({ fieldPath: 'entry:e1:title' });

        expect(socketEmit).toHaveBeenCalledWith(
            'lock:denied',
            expect.objectContaining({ fieldPath: 'entry:e1:title', heldByUserId: 'someone-else' })
        );
    });
});
