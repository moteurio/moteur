/**
 * Helpers for external search indexes (Algolia, Meilisearch, etc.) — build records from entry storage paths.
 */
import type { Entry } from '@moteurio/types/Model.js';

const ENTRY_JSON_PATH = /^models\/([^/]+)\/entries\/([^/]+)\/entry\.json$/;

export function parseEntryJsonStoragePath(
    relativePath: string
): { modelId: string; entryId: string } | null {
    const m = ENTRY_JSON_PATH.exec(relativePath);
    if (!m) return null;
    return { modelId: m[1], entryId: m[2] };
}

export function entrySearchObjectId(projectId: string, modelId: string, entryId: string): string {
    return `${projectId}::${modelId}::${entryId}`;
}

export function flattenEntryDataForSearch(data: Record<string, unknown>, maxLen = 50_000): string {
    const parts: string[] = [];
    let len = 0;
    const walk = (v: unknown): void => {
        if (len >= maxLen) return;
        if (v == null) return;
        if (typeof v === 'string') {
            parts.push(v);
            len += v.length;
        } else if (typeof v === 'number' || typeof v === 'boolean') {
            const s = String(v);
            parts.push(s);
            len += s.length;
        } else if (Array.isArray(v)) {
            for (const x of v) walk(x);
        } else if (typeof v === 'object') {
            for (const x of Object.values(v as object)) walk(x);
        }
    };
    walk(data);
    return parts.join(' ').slice(0, maxLen);
}

/** Normalized record for search providers (Algolia objectID / Meilisearch id). */
export function buildEntrySearchRecord(
    projectId: string,
    modelId: string,
    entryId: string,
    entry: Entry
): {
    objectID: string;
    projectId: string;
    modelId: string;
    entryId: string;
    status: string;
    title: string;
    slug: string;
    body: string;
} {
    const data = (entry.data ?? {}) as Record<string, unknown>;
    const title = String(data.title ?? data.label ?? data.name ?? entryId);
    const slug = data.slug != null ? String(data.slug) : '';
    return {
        objectID: entrySearchObjectId(projectId, modelId, entryId),
        projectId,
        modelId,
        entryId,
        status: (entry.status ?? 'draft') as string,
        title,
        slug,
        body: flattenEntryDataForSearch(data)
    };
}

/** Algolia / Meilisearch index uid segment from project id. */
export function searchIndexNameForProject(projectId: string): string {
    return `moteur-${projectId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}
