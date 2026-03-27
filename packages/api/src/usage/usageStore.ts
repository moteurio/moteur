/**
 * Tracks API request counts in two separate buckets: studio (operator/back-office)
 * and public (API key / collections).
 *
 * Current implementation is in-memory (counts reset on restart). For multi-instance
 * or persistent billing, replace with a store that implements the same record/get/reset
 * contract (e.g. Redis or DB-backed).
 */

export type RequestType = 'studio' | 'public';

export interface UsageCounts {
    studio: { total: number; windowStart: number };
    public: { byProject: Record<string, { total: number; windowStart: number }> };
}

const state: UsageCounts = {
    studio: { total: 0, windowStart: Date.now() },
    public: { byProject: {} }
};

/** Record one studio-scoped API request (global counter, not per-project). */
export function recordStudioRequest(): void {
    state.studio.total += 1;
}

/** Record one public API request for a project. */
export function recordPublicRequest(projectId: string): void {
    if (!state.public.byProject[projectId]) {
        state.public.byProject[projectId] = { total: 0, windowStart: Date.now() };
    }
    state.public.byProject[projectId].total += 1;
}

/** Get current usage counts (for dashboards or billing). */
export function getUsageCounts(): UsageCounts {
    return {
        studio: { ...state.studio },
        public: {
            byProject: Object.fromEntries(
                Object.entries(state.public.byProject).map(([k, v]) => [k, { ...v }])
            )
        }
    };
}

/** Reset studio-scoped count (e.g. new billing window). */
export function resetStudioCount(): void {
    state.studio = { total: 0, windowStart: Date.now() };
}

/** Reset public count for a project or all. */
export function resetPublicCount(projectId?: string): void {
    if (projectId) {
        delete state.public.byProject[projectId];
    } else {
        state.public.byProject = {};
    }
}
