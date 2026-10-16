import type { MoteurClient } from '../client.js';
import type { Entry } from '@moteurio/types';

/** A field and languages, e.g. `{ field: 'title', locales: ['fr', 'en'] }`. */
export type FieldLocales = { field: string; locales: string[] };

export type EntryListParams = {
    /** Comma-separated statuses, e.g. `draft,in_review`. */
    status?: string;
    /** Page size; 0 returns only the total and counts. */
    limit?: number;
    offset?: number | string;
    /**
     * `id`, `createdAt`, `updatedAt`, `publishedAt` or `data.<field>` (a field's text);
     * prefix `-` for descending.
     */
    sort?: string;
    /** Language to read a localized field in for a `data.<field>` sort. */
    sortLocale?: string;
    /** Words to find in the id and short text fields (case and accents ignored). */
    q?: string;
    /**
     * Field or virtual key → values (any of them matches). Virtual keys: `$workflow` (status,
     * plus `edits` for unpublished changes), `$editor`, `$creator`.
     */
    filters?: Record<string, string[]>;
    /** Entries missing at least one of these languages in the field. */
    missing?: FieldLocales;
    /** Rows grouped by this key, groups in `order` first. */
    group?: { key: string; order?: string[] };
    /** Keys to count matching entries for, per value (each ignoring its own filter). */
    facets?: string[];
    /** Count matching entries missing each language (ignoring `missing`). */
    missingCounts?: FieldLocales;
    /** Data fields to return, for list rows. */
    fields?: string[];
};

export type EntryListResult = {
    entries: Entry[];
    total: number;
    facets?: Record<string, Record<string, number>>;
    missingCounts?: Record<string, number>;
};

const fieldLocales = (v: FieldLocales) => `${v.field}:${v.locales.join(',')}`;

/** Query-string parameters for GET …/entries. */
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
        get(projectId: string, modelId: string, entryId: string): Promise<{ entry: Entry }> {
            return client.get(
                `/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}/entries/${encodeURIComponent(entryId)}`
            );
        },
        create(
            projectId: string,
            modelId: string,
            body: Record<string, unknown>
        ): Promise<{ entry: Entry }> {
            return client.post(
                `/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}/entries`,
                body
            );
        },
        update(
            projectId: string,
            modelId: string,
            entryId: string,
            body: Record<string, unknown>
        ): Promise<{ entry: Entry }> {
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
        ): Promise<{ entry: Record<string, unknown> }> {
            return client.patch(
                `/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}/entries/${encodeURIComponent(entryId)}/status`,
                { status }
            );
        },
        submitReview(
            projectId: string,
            modelId: string,
            entryId: string
        ): Promise<{ entry: Record<string, unknown> }> {
            return client.post(
                `/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}/entries/${encodeURIComponent(entryId)}/submit-review`
            );
        }
    };
}
