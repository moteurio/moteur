import type { ContentReference } from './References.js';

/**
 * Moteur Radar — content health and static analysis.
 * Violations are advisory only (never block save/publish in V1).
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
    /** The entry's id, or the page's when `modelSlug` is `pages`. */
    entrySlug: string;
    /** The entry's model, or `pages` for a page. */
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

/** Lightweight graph built once per scan for cross-entry rules. */
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
    /** entry slug -> list of entry slugs that reference it (for orphan detection) */
    referrers: Map<string, string[]>;
    locales: string[];
    /** The project's pages, by id (for links to pages). */
    pages?: Map<string, { id: string; label: string; type: string; status?: string }>;
    /** Every link and relation in entries and pages, at any depth. */
    references?: ContentReference[];
}
