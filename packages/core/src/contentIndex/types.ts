import type { Entry, EntryStatus } from '@moteurio/types/Model.js';

/**
 * Which version of each entry a query returns:
 * - `latest`: the entry file as it is on disk (Studio, previews).
 * - `published`: the public version — the snapshot taken at publish time when the entry has
 *   unpublished edits, otherwise the entry file (public API).
 */
export type EntryView = 'latest' | 'published';

export const ENTRY_SORT_FIELDS = ['id', 'createdAt', 'updatedAt', 'publishedAt'] as const;
export type EntrySortField = (typeof ENTRY_SORT_FIELDS)[number];

/**
 * Keys a list can filter, count and group on besides the model's own fields:
 * - `$workflow`: the entry's status, plus `edits` for a published entry with newer saves;
 * - `$editor` / `$creator`: who saved last / who created it (user ids).
 */
export const ENTRY_VIRTUAL_KEYS = ['$workflow', '$editor', '$creator'] as const;

/** A field name or a virtual key: letters, digits, `_` and `-` (a leading `$` for virtual keys). */
export const LIST_KEY = /^\$?[A-Za-z0-9_-]{1,64}$/;

export type EntryQuery = {
    view?: EntryView;
    /** Status of the returned version. Omit for every status. */
    status?: EntryStatus[];
    /**
     * Sort on an audit date or id, or on a field's text (`field` set): a localized field is read
     * in `locale` (falling back to its first non-empty language). Text sorts ignore case and
     * accents and put empty values last.
     */
    sort?:
        | { field: EntrySortField; direction: 'asc' | 'desc' }
        | { field: 'data'; key: string; locale?: string; direction: 'asc' | 'desc' };
    limit?: number;
    offset?: number;

    // -- list features (view `latest` only) ----------------------------------------------------
    /** Words to find in the entry's id and short text fields, ignoring case and accents. */
    search?: string;
    /** Field or virtual key → values; an entry matches when it has any of them, for every key. */
    filters?: Record<string, string[]>;
    /** Entries whose `field` has no text in at least one of `locales`. */
    missing?: { field: string; locales: string[] };
    /**
     * Rows come grouped by this key's value (in `order`, then by value; entries without a value
     * last), each group sorted by `sort`. With several values, an entry sits in its first group.
     */
    group?: { key: string; order?: string[] };
    /** Count matching entries per value of these keys, each ignoring its own filter. */
    facets?: string[];
    /** Count matching entries missing each locale in `field`, ignoring `missing`. */
    missingCounts?: { field: string; locales: string[] };
    /** Return only these data fields (plus id, type, status and meta), e.g. for list rows. */
    fields?: string[];
};

export type EntryQueryResult = {
    items: Entry[];
    /** Matching entries before limit/offset. */
    total: number;
    /** Per requested facet key: value → number of matching entries. */
    facets?: Record<string, Record<string, number>>;
    /** Per requested locale: number of matching entries missing it. */
    missingCounts?: Record<string, number>;
};

/** Whether a query uses search, filters, groups or counts (only supported on view `latest`). */
export function usesListFeatures(query: EntryQuery): boolean {
    return Boolean(
        query.search?.trim() ||
        (query.filters && Object.values(query.filters).some(v => v.length > 0)) ||
        query.missing ||
        query.group ||
        query.facets?.length ||
        query.missingCounts
    );
}

export type ReindexStats = {
    scanned: number;
    updated: number;
    removed: number;
    durationMs: number;
};

/**
 * Query index over a project's entry files. Entry files (and git) stay the source of truth:
 * an index only ever holds data it can rebuild from them, so adapters are interchangeable.
 */
export interface ContentIndex {
    readonly kind: string;

    queryEntries(projectId: string, modelId: string, query: EntryQuery): Promise<EntryQueryResult>;

    /**
     * The public version of an entry whose published snapshot differs from its file, or
     * undefined when the index can't answer (caller falls back to git).
     */
    getPublishedSnapshot(
        projectId: string,
        modelId: string,
        entryId: string,
        commit: string
    ): Promise<Entry | undefined>;

    /** Called after an entry file was written. */
    entryWritten(projectId: string, modelId: string, entryId: string, entry: Entry): Promise<void>;

    /** Called after an entry file was removed (deleted or moved to trash). */
    entryRemoved(projectId: string, modelId: string, entryId: string): Promise<void>;

    /** Called after every entry of a model was removed. */
    modelRemoved(projectId: string, modelId: string): Promise<void>;

    /**
     * Record the published snapshot for a commit the caller just made, so the index never has
     * to read it back from git.
     */
    publishedSnapshotTaken(
        projectId: string,
        modelId: string,
        entryId: string,
        commit: string,
        snapshot: Entry
    ): void;

    /** Files changed outside the index (branch checkout, merge, pull): re-check before next query. */
    invalidate(projectId: string): void;

    /** Re-check every entry file now. */
    reindex(projectId: string, options?: { full?: boolean }): Promise<ReindexStats>;

    /** Release resources for a project (e.g. before deleting its directory), or all projects. */
    close(projectId?: string): void;
}
