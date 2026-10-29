import type { Entry, EntryStatus } from '@moteurio/types/Model.js';
import type { EntrySortField } from './types.js';

/**
 * The commit holding an entry's public version. A null result may also mean the pointer is
 * missing: callers must check requiresPublishedSnapshot before using the current file.
 *
 * A published entry edited after publishing, or sent for review, keeps serving the content
 * committed at publish time (`publishedCommit`) until it is published again. An unpublished entry has no public
 * version, even though its audit still remembers the last publish.
 */
export function publishedSnapshotCommit(entry: Entry): string | null {
    return requiresPublishedSnapshot(entry) ? (entry.meta?.audit?.publishedCommit ?? null) : null;
}

/** A missing commit pointer must not turn newer edits into public content either. */
export function requiresPublishedSnapshot(entry: Entry): boolean {
    if (entry.status === 'unpublished') return false;
    const audit = entry.meta?.audit;
    // In review after being published: sites keep the published version until it's approved
    // (as pages do), whatever the revision count says.
    if (entry.status === 'in_review' && audit?.publishedCommit) return true;
    if (
        audit?.publishedRevision != null &&
        audit.revision != null &&
        audit.revision > audit.publishedRevision
    ) {
        return true;
    }
    return false;
}

export function entryStatus(entry: Entry): EntryStatus {
    return (entry.status ?? 'draft') as EntryStatus;
}

export function sortValue(entry: Entry, field: EntrySortField): string {
    if (field === 'id') return entry.id;
    return entry.meta?.audit?.[field] ?? '';
}
