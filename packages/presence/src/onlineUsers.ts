import { presenceStore } from './PresenceStore.js';

const FALLBACK_MAX_IDLE_MS = 90_000;
const MAX_CAP_MS = 86_400_000; // 24h safety cap

/**
 * Max age (ms) of a presence `updatedAt` to count the user as online for HTTP lists.
 * Env: `ONLINE_PRESENCE_MAX_IDLE_MS` (integer ms). Invalid/missing values fall back to 90_000.
 */
export function resolveOnlinePresenceMaxIdleMs(): number {
    const raw = process.env.ONLINE_PRESENCE_MAX_IDLE_MS;
    if (raw == null || String(raw).trim() === '') {
        return FALLBACK_MAX_IDLE_MS;
    }
    const n = Number.parseInt(String(raw).trim(), 10);
    if (!Number.isFinite(n) || n < 1_000) {
        return FALLBACK_MAX_IDLE_MS;
    }
    return Math.min(n, MAX_CAP_MS);
}

/** User IDs with a recent presence heartbeat in the given project (deduped). */
export function getOnlineUserIdsForProject(
    projectId: string,
    maxIdleMs: number = resolveOnlinePresenceMaxIdleMs()
): string[] {
    const now = Date.now();
    const ids = new Set<string>();
    for (const p of presenceStore.getByProject(projectId)) {
        if (now - p.updatedAt <= maxIdleMs) {
            ids.add(p.userId);
        }
    }
    return [...ids];
}
