import type { ContentReference } from './References.js';

/**
 * Moteur Radar: content health checks and static analysis.
 * Violations are advisory only. They never block saving or publishing.
 */

export type RadarSeverity = 'error' | 'warning' | 'suggestion';

export interface AIActionHint {
    feature: 'translation' | 'writing' | 'image-analysis';
    label: string;
    action: string;
}

export interface AIEnhancementHint {
    label: string;
    description: string;
    credits: number;
    action: string;
}

export interface RadarViolation {
    id: string;
    ruleId: string;
    severity: RadarSeverity;
    /** The entry's ID, or the page's ID when `modelSlug` is `pages`. */
    entrySlug: string;
    /** The entry's model ID, or `pages` for a page. */
    modelSlug: string;
    fieldPath?: string;
    locale?: string;
    message: string;
    hint?: string;
    aiAction?: AIActionHint;
    aiEnhancement?: AIEnhancementHint;
    detectedAt: string;
    resolvedAt?: string;
}

export interface RadarReport {
    scannedAt: string;
    summary: {
        errors: number;
        warnings: number;
        suggestions: number;
        total: number;
    };
    violations: RadarViolation[];
}

/** A lightweight graph built once per scan, used by rules that compare entries. */
export interface RadarGraphEntry {
    slug: string;
    modelId: string;
    data: Record<string, unknown>;
    status?: string;
    meta?: { audit?: { updatedAt?: string } };
}

export interface RadarGraphModel {
    id: string;
    fields: Record<string, { type?: string; options?: Record<string, unknown> }>;
}

export interface RadarGraph {
    entries: Map<string, RadarGraphEntry>;
    models: Map<string, RadarGraphModel>;
    /** Maps an entry slug to the slugs of the entries that reference it. Used to detect orphaned entries. */
    referrers: Map<string, string[]>;
    locales: string[];
    /** The project's pages keyed by ID. Used to check links to pages. */
    pages?: Map<string, { id: string; label: string; type: string; status?: string }>;
    /** Every link and relation in entries and pages, at any depth. */
    references?: ContentReference[];
}
