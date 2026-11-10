/**
 * API request counts in two buckets: admin client (operator and back-office requests) and public
 * (API key and channel requests, per project). The engine's metering keeps them per calendar month
 * (UTC), so they survive restarts once the server uses the file store (see `src/index.ts`).
 */
import {
    currentPeriod,
    getMeteringStore,
    periodBounds,
    recordRequest
} from '@moteurio/core/metering.js';

export type RequestType = 'studio' | 'public';

export interface UsageCounts {
    /** The `YYYY-MM` (UTC) period the counts cover. */
    period: string;
    studio: { total: number; windowStart: number };
    public: { byProject: Record<string, { total: number; windowStart: number }> };
}

/** Records one admin client API request. This is a global counter, not per project. */
export function recordStudioRequest(): void {
    recordRequest('studio');
}

/** Records one public API request for a project. */
export function recordPublicRequest(projectId: string): void {
    recordRequest('public', projectId);
}

/** Returns this month's counts, for dashboards or billing. */
export function getUsageCounts(period = currentPeriod()): UsageCounts {
    const totals = getMeteringStore().requestTotals(period);
    const windowStart = Date.parse(periodBounds(period).start);
    const studio =
        totals.studio + Object.values(totals.projects).reduce((n, p) => n + p.studioRequests, 0);
    return {
        period,
        studio: { total: studio, windowStart },
        public: {
            byProject: Object.fromEntries(
                Object.entries(totals.projects)
                    .filter(([, p]) => p.publicRequests > 0)
                    .map(([id, p]) => [id, { total: p.publicRequests, windowStart }])
            )
        }
    };
}
