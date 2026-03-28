/** In-memory progressive login delay state; cleared on process restart. */

export const LOGIN_FAILURE_TTL_MS = 60 * 60 * 1000;

export type LoginFailureEntry = {
    attempts: number;
    lastFailAt: number;
};

const store = new Map<string, LoginFailureEntry>();

export function sleep(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Evict entries whose last failure was more than LOGIN_FAILURE_TTL_MS ago.
 * Call on each login attempt (no separate timer).
 */
export function sweepStaleLoginFailures(): void {
    const cutoff = Date.now() - LOGIN_FAILURE_TTL_MS;
    for (const [key, entry] of store) {
        if (entry.lastFailAt < cutoff) {
            store.delete(key);
        }
    }
}

/**
 * Delay before handling this login attempt, in ms.
 * `failureCount` = consecutive failures already recorded for this email (after TTL sweep).
 * This request is attempt (failureCount + 1); delay matches min(2^(attempt-2), 30)s for attempt >= 2.
 */
export function delayMsForAttempt(failureCount: number): number {
    if (failureCount < 1) return 0;
    const seconds = Math.min(Math.pow(2, failureCount - 1), 30);
    return Math.floor(seconds * 1000);
}

/**
 * After a failed login, `failureCount` is the new total consecutive failures.
 * Seconds the client should wait before the next try (same formula as the delay applied on that next request).
 */
export function nextRetryAfterSeconds(failureCount: number): number {
    if (failureCount < 1) return 0;
    return Math.min(Math.pow(2, failureCount - 1), 30);
}

export function getLoginFailureEntry(normalizedEmail: string): LoginFailureEntry | undefined {
    return store.get(normalizedEmail);
}

/** Increment failure count in one synchronous update (safe on the Node event loop). Returns new count. */
export function recordLoginFailure(normalizedEmail: string): number {
    const now = Date.now();
    const cur = store.get(normalizedEmail);
    if (!cur) {
        store.set(normalizedEmail, { attempts: 1, lastFailAt: now });
        return 1;
    }
    cur.attempts += 1;
    cur.lastFailAt = now;
    return cur.attempts;
}

export function clearLoginFailures(normalizedEmail: string): void {
    store.delete(normalizedEmail);
}

/** Test helper: reset all delay state between tests. */
export function resetLoginDelayStoreForTests(): void {
    store.clear();
}
