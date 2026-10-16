import type { Entry, EntryStatus } from '@moteurio/types/Model.js';
import type { EntrySortField } from './types.js';

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
