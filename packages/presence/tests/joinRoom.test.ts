import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Socket } from 'socket.io';
import { registerJoinRoom } from '../src/events/joinRoom';
import { presenceStore } from '../src/PresenceStore';

const SOCKET_ID = 'sock-join-test';
const PROJECT = 'proj-join-test';

describe('registerJoinRoom', () => {
    let joinHandler: ((payload: unknown) => void | Promise<void>) | undefined;

    beforeEach(() => {
        joinHandler = undefined;
        presenceStore.remove(SOCKET_ID);
    });

    function setupSocket(userOverrides?: { projects?: string[] }): {
        socket: Socket;
        selfEmit: ReturnType<typeof vi.fn>;
        roomEmit: ReturnType<typeof vi.fn>;
    } {
        const selfEmit = vi.fn();
        const roomEmit = vi.fn();
        const socket = {
            id: SOCKET_ID,
            data: {
                user: {
                    userId: 'u-join',
                    name: 'Joiner',
                    projects: ['other', PROJECT],
                    ...userOverrides
                }
            },
            on(event: string, fn: (p: unknown) => void | Promise<void>) {
                if (event === 'join') joinHandler = fn;
            },
            join: vi.fn(),
            emit: selfEmit,
            to: vi.fn(() => ({ emit: roomEmit }))
        } as unknown as Socket;
        registerJoinRoom(socket);
        if (!joinHandler) throw new Error('join handler missing');
        return { socket, selfEmit, roomEmit };
    }

    it('joins socket.io room and registers presence', async () => {
        const { socket, roomEmit } = setupSocket();
        await joinHandler!({ projectId: PROJECT, screenId: 'sc1' });
        expect(socket.join).toHaveBeenCalledWith(PROJECT);
        expect(presenceStore.get(SOCKET_ID)?.projectId).toBe(PROJECT);
        expect(roomEmit).toHaveBeenCalledWith(
            'presence:change',
            expect.objectContaining({ userId: 'u-join' })
        );
    });

    it('rejects when user is not in project', async () => {
        const { socket, selfEmit, roomEmit } = setupSocket({ projects: ['only-other'] });
        await joinHandler!({ projectId: PROJECT });
        expect(socket.join).not.toHaveBeenCalled();
        expect(selfEmit).toHaveBeenCalledWith(
            'error',
            expect.objectContaining({ message: expect.stringContaining('Access denied') })
        );
        expect(roomEmit).not.toHaveBeenCalled();
    });

    it('rejoin same project refreshes without broadcasting presence:change to room', async () => {
        const { roomEmit } = setupSocket();
        await joinHandler!({ projectId: PROJECT, screenId: 'a' });
        roomEmit.mockClear();
        await joinHandler!({ projectId: PROJECT, screenId: 'b' });
        expect(roomEmit).not.toHaveBeenCalledWith('presence:change', expect.anything());
    });
});
