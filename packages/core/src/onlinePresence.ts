/** Optional hook from the presence host plugin for HTTP “online” user lists. */

const FALLBACK_MAX_IDLE_MS = 90_000;
const MAX_CAP_MS = 86_400_000;

export type OnlineUserIdsProvider = (projectId: string, maxIdleMs: number) => string[];

let provider: OnlineUserIdsProvider | null = null;

export function setOnlineUserIdsProvider(next: OnlineUserIdsProvider | null): void {
    provider = next;
}

/**
 * Max age (ms) of a presence heartbeat to count as online for HTTP lists.
 * Env: `ONLINE_PRESENCE_MAX_IDLE_MS` (integer ms). Invalid values fall back to 90_000.
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

/** User IDs considered online in a project (empty when the presence plugin is not loaded). */
export function getOnlineUserIdsForProject(
    projectId: string,
    maxIdleMs: number = resolveOnlinePresenceMaxIdleMs()
): string[] {
    return provider?.(projectId, maxIdleMs) ?? [];
}
