import { Server as IOServer, Socket } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import { registerAuthMiddleware } from './auth.js';
import { registerJoinRoom, type JoinRoomOptions } from './events/joinRoom.js';
import { registerLeaveRoom } from './events/leaveRoom.js';
import { registerPresenceUpdate } from './events/presenceUpdate.js';
import { registerScreenPatch } from './events/screenPatch.js';
import { registerDisconnect } from './events/disconnect.js';
import { presenceDebug } from './presenceDebugLog.js';

function getCorsOrigin(): string | string[] {
    const env = process.env.PRESENCE_CORS_ORIGINS ?? process.env.CORS_ORIGINS;
    if (!env || !env.trim()) return '*';
    return env
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
}

export interface CreatePresenceServerOptions {
    /** When provided, join is allowed only when this returns true for the project (e.g. project.presence.enabled). */
    isPresenceEnabledForProject?: (projectId: string) => Promise<boolean>;
}

export function createPresenceServer(
    httpServer: HTTPServer,
    options?: CreatePresenceServerOptions
): IOServer {
    const io = new IOServer(httpServer, {
        cors: {
            origin: getCorsOrigin()
        }
    });

    registerAuthMiddleware(io);

    const joinOptions: JoinRoomOptions | undefined = options?.isPresenceEnabledForProject
        ? { isPresenceEnabledForProject: options.isPresenceEnabledForProject }
        : undefined;

    io.on('connection', (socket: Socket) => {
        console.log(`[presence] User connected: ${socket.id}`);
        presenceDebug('socket:connected', {
            socketId: socket.id,
            PRESENCE_DEBUG:
                process.env.PRESENCE_DEBUG?.trim() ||
                '(unset — set to 1 for verbose screen:patch logs)'
        });

        // Register all event handlers for this socket
        registerJoinRoom(socket, joinOptions);
        registerLeaveRoom(socket);
        registerPresenceUpdate(socket);
        registerScreenPatch(socket);
        registerDisconnect(socket);
    });

    return io;
}
