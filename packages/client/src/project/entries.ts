import type { MoteurClient } from '../client.js';
import type { Entry, Review } from '@moteurio/types';

/** A field and a list of locales, for example `{ field: 'title', locales: ['fr', 'en'] }`. */
export type FieldLocales = { field: string; locales: string[] };

export type EntryListParams = {
    /** Comma-separated statuses to include, for example `draft,in_review`. */
    status?: string;
    /** Page size. With 0, only the total and counts are returned. */
    limit?: number;
    offset?: number | string;
    /**
     * Sort key: `id`, `createdAt`, `updatedAt`, `publishedAt` or `data.<field>` (the field's
     * text). Prefix it with `-` for descending order.
     */
    sort?: string;
    /** Locale used to read a localized field when sorting by `data.<field>`. */
    sortLocale?: string;
    /** Search text, matched against the ID and short text fields. Case and accents are ignored. */
    q?: string;
    /**
     * Filters keyed by field or virtual key. An entry matches a key when it has any of its values.
     * Virtual keys: `$workflow` (the status, plus `edits` for unpublished changes), `$editor` and
     * `$creator`.
     */
    filters?: Record<string, string[]>;
    /** Returns only entries where the field has no value in at least one of the listed locales. */
    missing?: FieldLocales;
    /** Groups the results by this key. Groups listed in `order` come first. */
    group?: { key: string; order?: string[] };
    /** Keys to return counts for, with one count per value. Each key's count ignores the filter on that same key. */
    facets?: string[];
    /** Counts the matching entries that have no value in each locale. This ignores the `missing` filter. */
    missingCounts?: FieldLocales;
    /** Data fields to include in each returned entry, which keeps list rows small. */
    fields?: string[];
};

export type EntryListResult = {
    entries: Entry[];
    total: number;
    facets?: Record<string, Record<string, number>>;
    missingCounts?: Record<string, number>;
};

const fieldLocales = (v: FieldLocales) => `${v.field}:${v.locales.join(',')}`;

/** Builds the query-string parameters for `GET …/entries`. */
export function entryListQuery(params: EntryListParams = {}): Record<string, string | number> {
    const q: Record<string, string | number> = {};
    if (params.status) q.status = params.status;
    if (params.limit != null) q.limit = params.limit;
    if (params.offset != null && params.offset !== '') q.offset = params.offset;
    if (params.sort) q.sort = params.sort;
    if (params.sortLocale) q.sortLocale = params.sortLocale;
    if (params.q?.trim()) q.q = params.q.trim();
    for (const [key, values] of Object.entries(params.filters ?? {})) {
        if (values.length) q[`filter.${key}`] = values.join(',');
    }
    if (params.missing?.locales.length) q.missing = fieldLocales(params.missing);
    if (params.group) {
        q.group = params.group.key;
        if (params.group.order?.length) q.groupOrder = params.group.order.join(',');
    }
    if (params.facets?.length) q.facets = params.facets.join(',');
    if (params.missingCounts?.locales.length) q.missingCounts = fieldLocales(params.missingCounts);
    if (params.fields?.length) q.fields = params.fields.join(',');
    return q;
}

export function entriesApi(client: MoteurClient) {
    return {
        list(
            projectId: string,
            modelId: string,
            params?: EntryListParams
        ): Promise<EntryListResult> {
            return client.get(
                `/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}/entries`,
                entryListQuery(params)
            );
        },
        get(
            projectId: string,
            modelId: string,
            entryId: string,
            options?: { resolveUrl?: boolean; resolveAssets?: boolean }
        ): Promise<{ entry: Entry & { resolvedUrl?: string }; version?: string }> {
            const params: Record<string, string> = {};
            if (options?.resolveUrl) params.resolveUrl = '1';
            if (options?.resolveAssets) params.resolveAssets = '1';
            return client.get(
                `/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}/entries/${encodeURIComponent(entryId)}`,
                Object.keys(params).length ? params : undefined
            );
        },
        create(projectId: string, modelId: string, body: Record<string, unknown>): Promise<Entry> {
            return client.post(
                `/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}/entries`,
                body
            );
        },
        update(
            projectId: string,
            modelId: string,
            entryId: string,
            body: Record<string, unknown>,
            options?: { version?: string }
        ): Promise<Entry> {
            if (options?.version)
                return client.request({
                    method: 'PATCH',
                    url: `/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}/entries/${encodeURIComponent(entryId)}`,
                    data: body,
                    headers: { 'If-Match': `"${options.version}"` }
                });
            return client.patch(
                `/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}/entries/${encodeURIComponent(entryId)}`,
                body
            );
        },
        delete(projectId: string, modelId: string, entryId: string): Promise<void> {
            return client.delete(
                `/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}/entries/${encodeURIComponent(entryId)}`
            );
        },
        status(
            projectId: string,
            modelId: string,
            entryId: string,
            status: string
        ): Promise<Entry> {
            return client.patch(
                `/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}/entries/${encodeURIComponent(entryId)}/status`,
                { status }
            );
        },
        submitReview(projectId: string, modelId: string, entryId: string): Promise<Review> {
            return client.post(
                `/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}/entries/${encodeURIComponent(entryId)}/submit-review`
            );
        }
    };
}
