import type { CollaborationMode, Presence, PresenceUpdate } from '@moteurio/types/Presence';
import { presenceDebug } from './presenceDebugLog.js';

interface FieldLockEntry {
    userId: string;
    acquiredAt: number;
}

export class PresenceStore {
    private presenceBySocket = new Map<string, Presence>();
    private fieldLocks = new Map<string, FieldLockEntry>(); // `${projectId}:${fieldPath}` → { userId, acquiredAt }

    /** Add or update a user's presence */
    update(
        socketId: string,
        userId: string,
        name: string,
        projectId: string,
        update: PresenceUpdate
    ): Presence {
        const prev = this.presenceBySocket.get(socketId);
        const nextScreenId =
            update.screenId === undefined
                ? prev?.screenId
                : update.screenId.length > 0
                  ? update.screenId
                  : undefined;
        const nextFieldPath = Object.prototype.hasOwnProperty.call(update, 'fieldPath')
            ? update.fieldPath && update.fieldPath.length > 0
                ? update.fieldPath
                : undefined
            : prev?.fieldPath;

        const nextOverlayId = Object.prototype.hasOwnProperty.call(update, 'overlayId')
            ? update.overlayId && update.overlayId.length > 0
                ? update.overlayId
                : undefined
            : prev?.overlayId;

        const nextPointerPulse = Object.prototype.hasOwnProperty.call(update, 'pointerPulse')
            ? update.pointerPulse
            : undefined;

        const nextCollaborationMode = Object.prototype.hasOwnProperty.call(
            update,
            'collaborationMode'
        )
            ? update.collaborationMode
            : prev?.collaborationMode;

        const now: Presence = {
            userId,
            name,
            projectId,
            avatarUrl: update.avatarUrl ?? prev?.avatarUrl,
            screenId: nextScreenId,
            entryId: update.entryId ?? prev?.entryId,
            fieldPath: nextFieldPath,
            overlayId: nextOverlayId,
            typing: update.typing ?? prev?.typing,
            cursor: update.cursor ?? prev?.cursor,
            pointerPulse: nextPointerPulse,
            collaborationMode: nextCollaborationMode,
            updatedAt: Date.now()
        };

        this.presenceBySocket.set(socketId, now);
        return now;
    }

    /** Remove user on disconnect */
    remove(socketId: string): Presence | undefined {
        const removed = this.presenceBySocket.get(socketId);
        this.presenceBySocket.delete(socketId);
        return removed;
    }

    /** Get all presence for a given project */
    getByProject(projectId: string): Presence[] {
        return Array.from(this.presenceBySocket.values()).filter(p => p.projectId === projectId);
    }

    /** Get a specific presence */
    get(socketId: string): Presence | undefined {
        return this.presenceBySocket.get(socketId);
    }
    lockField(projectId: string, fieldPath: string, userId: string) {
        const key = `${projectId}:${fieldPath}`;
        const current = this.fieldLocks.get(key);
        if (!current || current.userId === userId) {
            this.fieldLocks.set(key, { userId, acquiredAt: Date.now() });
        }
    }

    /**
     * Try to acquire a field lock. Optional TTL: if the current lock is held by another user
     * and has exceeded ttlMs, it is considered expired and cleared (logged), then we try again.
     * Returns true if lock was acquired, false if held by someone else.
     */
    tryLockField(
        projectId: string,
        fieldPath: string,
        userId: string,
        options?: { ttlMs?: number }
    ): boolean {
        const key = `${projectId}:${fieldPath}`;
        const now = Date.now();
        const ttlMs = options?.ttlMs ?? 0;

        let current = this.fieldLocks.get(key);
        if (current && ttlMs > 0 && current.userId !== userId) {
            if (now - current.acquiredAt >= ttlMs) {
                this.fieldLocks.delete(key);
                presenceDebug('lock:ttl_expired', { key, previousHolder: current.userId });
                current = undefined;
            }
        }
        if (current && current.userId !== userId) {
            return false;
        }
        this.fieldLocks.set(key, { userId, acquiredAt: now });
        return true;
    }

    unlockField(projectId: string, fieldPath: string, userId: string) {
        const key = `${projectId}:${fieldPath}`;
        const current = this.fieldLocks.get(key);
        if (current?.userId === userId) {
            this.fieldLocks.delete(key);
        }
    }

    unlockAllForUser(userId: string, projectId: string) {
        for (const [key, val] of this.fieldLocks.entries()) {
            if (val.userId === userId && key.startsWith(`${projectId}:`)) {
                this.fieldLocks.delete(key);
            }
        }
    }

    getLocks(projectId: string): Record<string, string> {
        const locks: Record<string, string> = {};
        const prefix = `${projectId}:`;
        for (const [key, val] of this.fieldLocks.entries()) {
            if (key.startsWith(prefix)) {
                // Use slice, not split(':', 2) — JS split limit caps array length and drops the rest
                // after the second segment, so namespaced keys like entry:id:field would corrupt.
                const fieldPath = key.slice(prefix.length);
                locks[fieldPath] = val.userId;
            }
        }
        return locks;
    }

    clearFieldLocksForProject(projectId: string): void {
        const prefix = `${projectId}:`;
        for (const key of [...this.fieldLocks.keys()]) {
            if (key.startsWith(prefix)) {
                this.fieldLocks.delete(key);
            }
        }
    }

    /** Get the screenId for a socket */
    getScreen(socketId: string): string | undefined {
        return this.presenceBySocket.get(socketId)?.screenId;
    }

    /** Get all presence for a given screenId (optional utility) */
    getByScreen(screenId: string): Presence[] {
        return Array.from(this.presenceBySocket.values()).filter(p => p.screenId === screenId);
    }

    /**
     * `exclusive` only when every socket in the project reports `exclusive`.
     * Omitted `collaborationMode` on a presence row counts as `shared`.
     */
    getEffectiveCollaborationMode(projectId: string): CollaborationMode {
        const users = this.getByProject(projectId);
        if (users.length === 0) return 'shared';
        for (const p of users) {
            if (p.collaborationMode !== 'exclusive') return 'shared';
        }
        return 'exclusive';
    }
}

export const presenceStore = new PresenceStore();
