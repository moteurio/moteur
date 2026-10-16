import type { Entry } from '@moteurio/types/Model.js';
import { entryKey } from '../utils/storageKeys.js';
import { listEntryFiles, mapSliced, readEntryFile, readPublishedSnapshots } from './entryFiles.js';
import { applyQuery } from './listQuery.js';
import { publishedSnapshotCommit } from './publishedView.js';
import type { ContentIndex, EntryQuery, EntryQueryResult, ReindexStats } from './types.js';
import { usesListFeatures } from './types.js';

/**
 * No index: every query reads and parses every entry file of the model. Always correct, cost
 * grows with the number of entries. Used when MOTEUR_CONTENT_INDEX=files, or when SQLite is
 * unavailable.
 */
export class FileScanIndex implements ContentIndex {
    readonly kind = 'files';

    async queryEntries(
        projectId: string,
        modelId: string,
        query: EntryQuery
    ): Promise<EntryQueryResult> {
        const refs = await listEntryFiles(projectId, modelId);
        let entries = (await mapSliced(refs, r => readEntryFile(r.file))).filter(
            (e): e is Entry => e != null
        );
        if (query.view === 'published') {
            if (usesListFeatures(query)) {
                throw new Error('Search, filters, groups and counts only work on the latest view');
            }
            entries = await this.toPublished(projectId, modelId, entries);
        }
        return applyQuery(entries, query);
    }

    private async toPublished(
        projectId: string,
        modelId: string,
        entries: Entry[]
    ): Promise<Entry[]> {
        const wanted = entries.flatMap(e => {
            const commit = publishedSnapshotCommit(e);
            return commit ? [{ modelId, entryId: e.id, commit }] : [];
        });
        if (wanted.length === 0) return entries;
        const snapshots = await readPublishedSnapshots(projectId, wanted);
        return entries.map(e => {
            const commit = publishedSnapshotCommit(e);
            if (!commit) return e;
            return snapshots.get(`${commit}:${entryKey(modelId, e.id)}`) ?? e;
        });
    }

    async getPublishedSnapshot(): Promise<Entry | undefined> {
        return undefined;
    }

    async entryWritten(): Promise<void> {}
    async entryRemoved(): Promise<void> {}
    async modelRemoved(): Promise<void> {}
    publishedSnapshotTaken(): void {}
    invalidate(): void {}

    async reindex(): Promise<ReindexStats> {
        return { scanned: 0, updated: 0, removed: 0, durationMs: 0 };
    }

    close(): void {}
}
