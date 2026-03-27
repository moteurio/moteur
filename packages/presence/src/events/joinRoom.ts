import { Socket } from 'socket.io';
import { presenceStore } from '../PresenceStore.js';
import type { PresenceUpdate } from '@moteurio/types/Presence';
import { validateJoinPayload } from '../validate.js';
import { emitJoinHydrationToSocket } from './joinHydration.js';
import { notifyPresenceRoomModeForJoin } from './emitRoomMode.js';
import { presenceDebug } from '../presenceDebugLog.js';

export interface JoinRoomOptions {
    /** When provided, join is allowed only if this returns true (e.g. project.presence.enabled !== false). */
    isPresenceEnabledForProject?: (projectId: string) => Promise<boolean>;
}

export function registerJoinRoom(socket: Socket, options?: JoinRoomOptions) {
    socket.on('join', async (payload: unknown) => {
        const user = socket.data.user;

        if (!user?.userId || !user.name) {
            presenceDebug('join:rejected_no_user', { socketId: socket.id });
            console.warn(`[presence] Invalid join attempt from ${socket.id}`);
            return;
        }

        const parsed = validateJoinPayload(payload);
        if (!parsed) {
            presenceDebug('join:invalid_payload', { socketId: socket.id, userId: user.userId });
            console.warn(`[presence] Invalid join payload from ${socket.id}`);
            return;
        }

        const { projectId, screenId, collaborationMode } = parsed;

        const allowedProjects: string[] = user.projects ?? [];
        if (!allowedProjects.includes(projectId)) {
            presenceDebug('join:denied_not_in_project', {
                socketId: socket.id,
                userId: user.userId,
                projectId
            });
            socket.emit('error', {
                message: 'Access denied: you do not have access to this project'
            });
            return;
        }

        if (options?.isPresenceEnabledForProject) {
            const enabled = await options.isPresenceEnabledForProject(projectId);
            if (!enabled) {
                presenceDebug('join:denied_presence_disabled', {
                    socketId: socket.id,
                    userId: user.userId,
                    projectId
                });
                socket.emit('error', {
                    message: 'Presence is disabled for this project'
                });
                return;
            }
        }

        socket.join(projectId);

        const initial: PresenceUpdate = {
            screenId,
            ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
            ...(collaborationMode ? { collaborationMode } : {})
        };

        const previousEffective = presenceStore.getEffectiveCollaborationMode(projectId);

        /** Same socket already in this project (e.g. Studio in-project navigation): refresh snapshots only. */
        const alreadyInProject = presenceStore.get(socket.id)?.projectId === projectId;
        if (alreadyInProject) {
            presenceStore.update(socket.id, user.userId, user.name, projectId, initial);
            emitJoinHydrationToSocket(socket, projectId, screenId);
            notifyPresenceRoomModeForJoin(socket, projectId, previousEffective);
            presenceDebug('room:rejoin', {
                projectId,
                userId: user.userId,
                socketId: socket.id,
                screenId: screenId ?? null
            });
            return;
        }

        const presence = presenceStore.update(
            socket.id,
            user.userId,
            user.name,
            projectId,
            initial
        );

        console.log(`[presence] ${user.name} joined project ${projectId}`);
        presenceDebug('room:join', {
            projectId,
            userId: user.userId,
            socketId: socket.id,
            screenId: screenId ?? null
        });

        emitJoinHydrationToSocket(socket, projectId, screenId);
        notifyPresenceRoomModeForJoin(socket, projectId, previousEffective);

        socket.to(projectId).emit('presence:change', {
            userId: presence.userId,
            changes: initial
        });
    });
}
