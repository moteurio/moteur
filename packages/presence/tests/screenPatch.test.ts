import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Socket } from 'socket.io';
import { registerScreenPatch } from '../src/events/screenPatch';
import { clearScreenPatchRateLimit } from '../src/screenPatchRateLimit';
import { presenceStore } from '../src/PresenceStore';
import { screenEphemeralStore } from '../src/ScreenEphemeralStore';

const SOCKET_ID = 'sock-screen-patch';
const USER_ID = 'u-patch';
const PROJECT_ID = 'proj-patch';
const SCREEN_ID = 'models/demo/entries/e1';

describe('registerScreenPatch', () => {
    let patchHandler: ((payload: unknown) => void) | undefined;
    const roomEmit = vi.fn();

    beforeEach(() => {
        patchHandler = undefined;
        roomEmit.mockReset();
        presenceStore.clearFieldLocksForProject(PROJECT_ID);
        presenceStore.unlockAllForUser(USER_ID, PROJECT_ID);
        presenceStore.remove(SOCKET_ID);
        screenEphemeralStore.clearScreen(SCREEN_ID);
        clearScreenPatchRateLimit(SOCKET_ID);
    });

    function connectHandler(): (payload: unknown) => void {
        const socket = {
            id: SOCKET_ID,
            data: { user: { userId: USER_ID, name: 'Alice' } },
            on(event: string, fn: (p: unknown) => void) {
                if (event === 'screen:patch') patchHandler = fn;
            },
            to: vi.fn(() => ({ emit: roomEmit })),
            emit: vi.fn()
        } as unknown as Socket;

        registerScreenPatch(socket);
        if (!patchHandler) throw new Error('screen:patch handler not registered');
        return patchHandler;
    }

    it('broadcasts screen:change in shared mode without lock', () => {
        const handler = connectHandler();
        presenceStore.update(SOCKET_ID, USER_ID, 'Alice', PROJECT_ID, { screenId: SCREEN_ID });
        handler({
            screenId: SCREEN_ID,
            fields: { 'entry:e1:title': JSON.stringify('hello') }
        });
        expect(roomEmit).toHaveBeenCalledWith(
            'screen:change',
            expect.objectContaining({
                screenId: SCREEN_ID,
                fields: { 'entry:e1:title': JSON.stringify('hello') },
                originUserId: USER_ID
            })
        );
        expect(screenEphemeralStore.getField(SCREEN_ID, 'entry:e1:title')).toBe(
            JSON.stringify('hello')
        );
    });

    it('in exclusive mode rejects field patch when lock not held', () => {
        connectHandler();
        const socketEmit = vi.fn();
        const socket = {
            id: SOCKET_ID,
            data: { user: { userId: USER_ID, name: 'Alice' } },
            on(event: string, fn: (p: unknown) => void) {
                if (event === 'screen:patch') patchHandler = fn;
            },
            to: vi.fn(() => ({ emit: roomEmit })),
            emit: socketEmit
        } as unknown as Socket;
        registerScreenPatch(socket);

        presenceStore.update(SOCKET_ID, USER_ID, 'Alice', PROJECT_ID, {
            screenId: SCREEN_ID,
            collaborationMode: 'exclusive'
        });
        presenceStore.tryLockField(PROJECT_ID, 'entry:e1:title', 'other');

        patchHandler!({
            screenId: SCREEN_ID,
            fields: { 'entry:e1:title': '"x"' }
        });

        expect(roomEmit).not.toHaveBeenCalled();
        expect(socketEmit).toHaveBeenCalledWith(
            'screen:patch:denied',
            expect.objectContaining({ fieldPaths: ['entry:e1:title'] })
        );
    });

    it('in exclusive mode accepts patch when user holds lock', () => {
        const handler = connectHandler();
        presenceStore.update(SOCKET_ID, USER_ID, 'Alice', PROJECT_ID, {
            screenId: SCREEN_ID,
            collaborationMode: 'exclusive'
        });
        presenceStore.tryLockField(PROJECT_ID, 'entry:e1:title', USER_ID);
        handler({
            screenId: SCREEN_ID,
            fields: { 'entry:e1:title': '"ok"' }
        });
        expect(roomEmit).toHaveBeenCalled();
    });

    it('does nothing without authenticated user', () => {
        const socket = {
            id: SOCKET_ID,
            data: { user: undefined },
            on(event: string, fn: (p: unknown) => void) {
                if (event === 'screen:patch') patchHandler = fn;
            },
            to: vi.fn(() => ({ emit: roomEmit })),
            emit: vi.fn()
        } as unknown as Socket;
        registerScreenPatch(socket);
        patchHandler!({ screenId: SCREEN_ID, ui: { tab: 'x' } });
        expect(roomEmit).not.toHaveBeenCalled();
    });

    it('does nothing when socket has not joined a project', () => {
        const handler = connectHandler();
        handler({ screenId: SCREEN_ID, ui: { tab: 'x' } });
        expect(roomEmit).not.toHaveBeenCalled();
    });

    it('broadcasts ui-only patch in shared mode', () => {
        const handler = connectHandler();
        presenceStore.update(SOCKET_ID, USER_ID, 'Alice', PROJECT_ID, { screenId: SCREEN_ID });
        handler({ screenId: SCREEN_ID, ui: { 'layoutTab:core': 'json' } });
        expect(roomEmit).toHaveBeenCalledWith(
            'screen:change',
            expect.objectContaining({
                screenId: SCREEN_ID,
                ui: { 'layoutTab:core': 'json' }
            })
        );
    });

    it('drops patch after rate limit', () => {
        const handler = connectHandler();
        presenceStore.update(SOCKET_ID, USER_ID, 'Alice', PROJECT_ID, { screenId: SCREEN_ID });
        for (let i = 0; i < 50; i++) {
            handler({ screenId: SCREEN_ID, ui: { k: String(i) } });
        }
        roomEmit.mockClear();
        handler({ screenId: SCREEN_ID, ui: { k: 'next' } });
        expect(roomEmit).not.toHaveBeenCalled();
    });

    it('rejects patch when payload screenId does not match active presence screenId', () => {
        const handler = connectHandler();
        presenceStore.update(SOCKET_ID, USER_ID, 'Alice', PROJECT_ID, { screenId: SCREEN_ID });
        handler({
            screenId: `${SCREEN_ID}/other`,
            fields: { 'entry:e1:title': '"bad"' },
            ui: { 'layoutTab:core': 'visual' }
        });
        expect(roomEmit).not.toHaveBeenCalled();
        expect(
            screenEphemeralStore.getField(`${SCREEN_ID}/other`, 'entry:e1:title')
        ).toBeUndefined();
    });

    it('keeps ui patches shared in exclusive mode', () => {
        const handler = connectHandler();
        presenceStore.update(SOCKET_ID, USER_ID, 'Alice', PROJECT_ID, {
            screenId: SCREEN_ID,
            collaborationMode: 'exclusive'
        });
        handler({
            screenId: SCREEN_ID,
            ui: { 'layoutTab:core': 'json' }
        });
        expect(roomEmit).toHaveBeenCalledWith(
            'screen:change',
            expect.objectContaining({
                screenId: SCREEN_ID,
                ui: { 'layoutTab:core': 'json' }
            })
        );
    });
});
