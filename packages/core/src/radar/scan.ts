import type { RadarViolation, RadarReport } from '@moteurio/types/Radar.js';
import { buildRadarGraph } from './graph.js';
import { runAllRules } from './rules/index.js';
import { loadRadarReport, saveRadarReport, computeSummary } from './storage.js';
import { dispatch as webhookDispatch } from '../webhooks/webhookService.js';

export interface ScanOptions {
    source?: 'studio' | 'api' | 'scheduler';
}

/**
 * Run a full project scan and persist results. Fires webhooks for created/resolved violations.
 */
export async function runFullScan(projectId: string, options?: ScanOptions): Promise<RadarReport> {
    const graph = await buildRadarGraph(projectId);
    const violations: RadarViolation[] = [];
    const now = new Date().toISOString();

    for (const [, entry] of graph.entries) {
        const model = graph.models.get(entry.modelId);
        if (!model) continue;
        const ctx = {
            entry: {
                slug: entry.slug,
                modelId: entry.modelId,
                data: entry.data,
                status: entry.status,
                meta: entry.meta
            },
            model: { id: model.id, fields: model.fields },
            graph,
            locales: graph.locales
        };
        violations.push(...runAllRules(ctx));
    }

    const summary = computeSummary(violations);
    const report: RadarReport = { scannedAt: now, summary, violations };
    const previous = await loadRadarReport(projectId);
    await saveRadarReport(projectId, report);

    const source = options?.source ?? 'api';
    const prevIds = new Set((previous?.violations ?? []).map(v => v.id));
    const newIds = new Set(violations.map(v => v.id));
    for (const v of violations) {
        if (!prevIds.has(v.id)) {
            try {
                webhookDispatch('radar.violation.created', { violation: v }, { projectId, source });
            } catch {
                // never fail scan on webhook
            }
        }
    }
    for (const v of previous?.violations ?? []) {
        if (!newIds.has(v.id)) {
            try {
                webhookDispatch(
                    'radar.violation.resolved',
                    { violation: { ...v, resolvedAt: now } },
                    { projectId, source }
                );
            } catch {
                // never fail scan on webhook
            }
        }
    }

    return report;
}

/**
 * Scan a single entry and merge result into stored report. Updates only that entry's violations.
 */
export async function runEntryScan(
    projectId: string,
    modelId: string,
    entryId: string,
    options?: ScanOptions
): Promise<RadarReport> {
    const graph = await buildRadarGraph(projectId);
    const entry = graph.entries.get(entryId);
    if (!entry) {
        const existing = await loadRadarReport(projectId);
        if (existing) {
            const violations = existing.violations.filter(v => v.entrySlug !== entryId);
            const summary = computeSummary(violations);
            const report: RadarReport = {
                scannedAt: new Date().toISOString(),
                summary,
                violations
            };
            await saveRadarReport(projectId, report);
            return report;
        }
        return {
            scannedAt: new Date().toISOString(),
            summary: { errors: 0, warnings: 0, suggestions: 0, total: 0 },
            violations: []
        };
    }

    const model = graph.models.get(entry.modelId);
    if (!model) {
        const existing = await loadRadarReport(projectId);
        return (
            existing ?? {
                scannedAt: new Date().toISOString(),
                summary: { errors: 0, warnings: 0, suggestions: 0, total: 0 },
                violations: []
            }
        );
    }

    const ctx = {
        entry: {
            slug: entry.slug,
            modelId: entry.modelId,
            data: entry.data,
            status: entry.status,
            meta: entry.meta
        },
        model: { id: model.id, fields: model.fields },
        graph,
        locales: graph.locales
    };
    const entryViolations = runAllRules(ctx);
    const now = new Date().toISOString();

    const previous = await loadRadarReport(projectId);
    const otherViolations = (previous?.violations ?? []).filter(v => v.entrySlug !== entryId);
    const violations = [...otherViolations, ...entryViolations];
    const summary = computeSummary(violations);
    const report: RadarReport = { scannedAt: now, summary, violations };
    await saveRadarReport(projectId, report);

    const source = options?.source ?? 'api';
    const prevForEntry = new Set(
        (previous?.violations ?? []).filter(v => v.entrySlug === entryId).map(v => v.id)
    );
    const newForEntry = new Set(entryViolations.map(v => v.id));
    for (const v of entryViolations) {
        if (!prevForEntry.has(v.id)) {
            try {
                webhookDispatch('radar.violation.created', { violation: v }, { projectId, source });
            } catch {
                // ignore
            }
        }
    }
    for (const v of previous?.violations ?? []) {
        if (v.entrySlug === entryId && !newForEntry.has(v.id)) {
            try {
                webhookDispatch(
                    'radar.violation.resolved',
                    { violation: { ...v, resolvedAt: now } },
                    { projectId, source }
                );
            } catch {
                // ignore
            }
        }
    }

    return report;
}

const debounceMap = new Map<string, ReturnType<typeof setTimeout>>();
const DEBOUNCE_MS = 500;

/**
 * Debounced single-entry scan. Call after entry save.
 */
export function runEntryScanDebounced(
    projectId: string,
    modelId: string,
    entryId: string,
    options?: ScanOptions
): void {
    const key = `${projectId}:${modelId}:${entryId}`;
    const existing = debounceMap.get(key);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
        debounceMap.delete(key);
        runEntryScan(projectId, modelId, entryId, options).catch(() => {
            // log in dev if needed
        });
    }, DEBOUNCE_MS);
    debounceMap.set(key, t);
}
