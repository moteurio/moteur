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

export type EntryQuery = {
    view?: EntryView;
    /** Status of the returned version. Omit for every status. */
    status?: EntryStatus[];
    sort?: { field: EntrySortField; direction: 'asc' | 'desc' };
    limit?: number;
    offset?: number;
};

export type EntryQueryResult = {
    items: Entry[];
    /** Matching entries before limit/offset. */
    total: number;
};

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
