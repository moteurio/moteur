import type { Socket } from 'socket.io';
import { presenceStore } from '../PresenceStore.js';
import { screenEphemeralStore } from '../ScreenEphemeralStore.js';
import { validateScreenPatch } from '../validate.js';
import { presenceDebug, presenceDebugVerbose } from '../presenceDebugLog.js';
import { allowScreenPatchRateLimit } from '../screenPatchRateLimit.js';

function filterFieldsByLocks(
    projectId: string,
    userId: string,
    fields: Record<string, string> | undefined
): { allowed: Record<string, string> | undefined; deniedKeys: string[] } {
    if (!fields) return { allowed: undefined, deniedKeys: [] };
    const locks = presenceStore.getLocks(projectId);
    const allowed: Record<string, string> = {};
    const deniedKeys: string[] = [];
    for (const [k, v] of Object.entries(fields)) {
        const holder = locks[k];
        if (holder !== undefined && holder !== userId) {
            deniedKeys.push(k);
        } else {
            allowed[k] = v;
        }
    }
    return {
        allowed: Object.keys(allowed).length > 0 ? allowed : undefined,
        deniedKeys
    };
}

export function registerScreenPatch(socket: Socket): void {
    socket.on('screen:patch', (payload: unknown) => {
        const user = socket.data.user;
        const payloadKeys =
            payload && typeof payload === 'object' && !Array.isArray(payload)
                ? Object.keys(payload as Record<string, unknown>)
                : [];
        presenceDebugVerbose('screen:patch:received', {
            socketId: socket.id,
            userId: user?.userId ?? null,
            payloadKeys
        });
        if (!user?.userId || !user.name) {
            presenceDebug('screen:patch:rejected_no_user', { socketId: socket.id });
            return;
        }

        if (!allowScreenPatchRateLimit(socket.id)) {
            presenceDebug('screen:patch:rate_limited', {
                socketId: socket.id,
                userId: user.userId
            });
            return;
        }

        const parsed = validateScreenPatch(payload);
        if (!parsed) {
            presenceDebug('screen:patch:invalid', { socketId: socket.id, userId: user.userId });
            return;
        }

        const prev = presenceStore.get(socket.id);
        const projectId = prev?.projectId;
        if (!projectId) {
            presenceDebug('screen:patch:no_project', { socketId: socket.id, userId: user.userId });
            return;
        }
        if (!prev?.screenId || prev.screenId !== parsed.screenId) {
            presenceDebug('screen:patch:screen_mismatch', {
                socketId: socket.id,
                userId: user.userId,
                projectId,
                claimedScreenId: parsed.screenId,
                activeScreenId: prev?.screenId ?? null
            });
            return;
        }

        const mode = presenceStore.getEffectiveCollaborationMode(projectId);
        let fields = parsed.fields;
        if (mode === 'exclusive' && fields) {
            const { allowed, deniedKeys } = filterFieldsByLocks(projectId, user.userId, fields);
            fields = allowed;
            if (deniedKeys.length > 0) {
                presenceDebug('screen:patch:lock_filtered', {
                    projectId,
                    userId: user.userId,
                    deniedKeys
                });
                socket.emit('screen:patch:denied', { fieldPaths: deniedKeys });
            }
        }

        if (!fields && !parsed.ui) return;

        const now = Date.now();
        const merged = screenEphemeralStore.applyPatch(
            parsed.screenId,
            user.userId,
            now,
            fields,
            parsed.ui
        );
        const hasOut = Object.keys(merged.fields).length > 0 || Object.keys(merged.ui).length > 0;
        if (!hasOut) return;

        presenceDebugVerbose('screen:patch', {
            projectId,
            userId: user.userId,
            screenId: parsed.screenId,
            fieldKeys: Object.keys(merged.fields),
            uiKeys: Object.keys(merged.ui)
        });

        socket.to(projectId).emit('screen:change', {
            screenId: parsed.screenId,
            fields: merged.fields,
            ui: merged.ui,
            originUserId: user.userId
        });
    });
}
