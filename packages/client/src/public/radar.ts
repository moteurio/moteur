import type { MoteurClient } from '../client.js';
import type { RadarReport } from '@moteurio/types';

export function publicRadarApi(client: MoteurClient, projectId: string) {
    return {
        get(options?: {
            /** When true, runs a full scan (query: `scan=true`). */
            fullScan?: boolean;
            severity?: string;
            model?: string;
            locale?: string;
            ruleId?: string;
        }): Promise<RadarReport> {
            const q: Record<string, string> = {};
            if (options?.fullScan) q.scan = 'true';
            if (options?.severity) q.severity = options.severity;
            if (options?.model) q.model = options.model;
            if (options?.locale) q.locale = options.locale;
            if (options?.ruleId) q.ruleId = options.ruleId;
            const params = Object.keys(q).length ? q : undefined;
            return client.get(`/projects/${encodeURIComponent(projectId)}/radar`, params);
        }
    };
}
