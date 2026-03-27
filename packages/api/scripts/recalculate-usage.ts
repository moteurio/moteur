#!/usr/bin/env node
/**
 * Recalculate API request counts from the audit log (JSON lines).
 * Use for billing or long-term totals when in-memory counts are not persisted.
 *
 * Usage:
 *   npx tsx packages/api/scripts/recalculate-usage.ts [path-to-api-requests.log]
 *   API_REQUEST_LOG_FILE=/var/log/api-requests.log npx tsx packages/api/scripts/recalculate-usage.ts
 *
 * Options (env):
 *   API_REQUEST_LOG_FILE or first arg: log file path
 *   USAGE_WINDOW: 'day' | 'month' | 'all' (default: 'all') — bucket by day, month, or single total
 *
 * Output: JSON to stdout. Pipe to jq or redirect to a file.
 */

import fs from 'fs';
import path from 'path';

/** Log `type` field; legacy logs used `admin` before it was renamed to `studio`. */
export type RequestLogEntryType = 'studio' | 'public' | 'admin' | null;

export interface RequestLogEntry {
    timestamp: string;
    type: RequestLogEntryType;
    projectId?: string;
    method: string;
    path: string;
    statusCode: number;
    durationMs?: number;
}

export type Window = 'day' | 'month' | 'all';

export function getWindowKey(iso: string, window: Window): string {
    if (window === 'all') return 'all';
    const d = new Date(iso);
    if (window === 'day') return d.toISOString().slice(0, 10); // YYYY-MM-DD
    return d.toISOString().slice(0, 7); // YYYY-MM
}

export type Bucket = { studio: number; public: Record<string, number> };

function isStudioEntryType(t: RequestLogEntryType): boolean {
    return t === 'studio' || t === 'admin';
}

export function recalculateFromContent(
    content: string,
    window: Window,
    sourceLabel = 'inline'
): { source: string; window: Window; totals: Record<string, Bucket> } {
    const lines = content.split('\n').filter(Boolean);
    const byWindow: Record<string, Bucket> = {};

    function getBucket(key: string): Bucket {
        if (!byWindow[key]) {
            byWindow[key] = { studio: 0, public: {} };
        }
        return byWindow[key];
    }

    for (const line of lines) {
        let entry: RequestLogEntry;
        try {
            entry = JSON.parse(line) as RequestLogEntry;
        } catch {
            continue;
        }
        if (!isStudioEntryType(entry.type) && entry.type !== 'public') continue;

        const key = getWindowKey(entry.timestamp, window);
        const b = getBucket(key);

        if (isStudioEntryType(entry.type)) {
            b.studio += 1;
        } else {
            const pid = entry.projectId ?? '_unknown';
            b.public[pid] = (b.public[pid] ?? 0) + 1;
        }
    }

    return {
        source: sourceLabel,
        window,
        totals: byWindow
    };
}

function main(): void {
    const logPath =
        process.argv[2]?.trim() ||
        process.env.API_REQUEST_LOG_FILE?.trim() ||
        (process.env.API_REQUEST_LOG_DIR
            ? path.join(process.env.API_REQUEST_LOG_DIR, 'api-requests.log')
            : '');
    const window = (process.env.USAGE_WINDOW || 'all') as Window;
    if (!logPath) {
        console.error('Usage: recalculate-usage.ts <path-to-api-requests.log>');
        console.error('   or set API_REQUEST_LOG_FILE or API_REQUEST_LOG_DIR');
        process.exit(1);
    }
    if (!fs.existsSync(logPath)) {
        console.error('File not found:', logPath);
        process.exit(1);
    }

    const content = fs.readFileSync(logPath, 'utf8');
    const result = recalculateFromContent(content, window, logPath);
    console.log(JSON.stringify(result, null, 2));
}

const isRunDirectly =
    typeof process !== 'undefined' &&
    process.argv[1] != null &&
    /recalculate-usage\.(ts|js)$/.test(process.argv[1]);
if (isRunDirectly) {
    main();
}
