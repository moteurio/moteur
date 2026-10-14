import type { Entry, EntryStatus } from '@moteurio/types/Model.js';
import type { EntryQuery, EntrySortField } from './types.js';

/**
 * The commit holding an entry's public version, or null when the entry file itself is the
 * public version.
 *
 * A published entry edited after publishing keeps serving the content committed at publish
 * time (`publishedCommit`) until it is published again. An unpublished entry has no public
 * version, even though its audit still remembers the last publish.
 */
export function publishedSnapshotCommit(entry: Entry): string | null {
    if (entry.status === 'unpublished') return null;
    const audit = entry.meta?.audit;
    if (
        audit?.publishedCommit &&
        audit.publishedRevision != null &&
        audit.revision != null &&
        audit.revision > audit.publishedRevision
    ) {
        return audit.publishedCommit;
    }
    return null;
}

export function entryStatus(entry: Entry): EntryStatus {
    return (entry.status ?? 'draft') as EntryStatus;
}

export function sortValue(entry: Entry, field: EntrySortField): string {
    if (field === 'id') return entry.id;
    return entry.meta?.audit?.[field] ?? '';
}

/** Filter, sort and page entries in memory, with the same semantics as an index query. */
export function applyQuery(entries: Entry[], query: EntryQuery): { items: Entry[]; total: number } {
    const statuses = query.status;
    const matching = statuses ? entries.filter(e => statuses.includes(entryStatus(e))) : entries;
    const { field, direction } = query.sort ?? { field: 'id', direction: 'asc' };
    const sign = direction === 'desc' ? -1 : 1;
    const sorted = [...matching].sort((a, b) => {
        const av = sortValue(a, field);
        const bv = sortValue(b, field);
        if (av !== bv) return av < bv ? -sign : sign;
        // Ties break on id, in the same direction (lets SQL adapters sort from an index).
        return a.id < b.id ? -sign : a.id > b.id ? sign : 0;
    });
    const offset = query.offset ?? 0;
    const items =
        query.limit != null ? sorted.slice(offset, offset + query.limit) : sorted.slice(offset);
    return { items, total: matching.length };
}
