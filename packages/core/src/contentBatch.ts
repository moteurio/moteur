/**
 * Many changes saved as one: inside a batch, what would be committed, sent to webhooks, scanned
 * by Radar or written to the activity log one change at a time is held instead, and the batch's
 * owner (an import) commits it all at once, or undoes it.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export type ContentBatch = {
    projectId: string;
    /** Files changed, relative to the project folder. */
    paths: Set<string>;
    /** Webhooks held back, by event. */
    held: Map<string, number>;
    /** Once over, work it started late (image variants…) saves as usual. */
    open: boolean;
};

const current = new AsyncLocalStorage<ContentBatch>();

/** The batch the running work belongs to, when it is one for this project. */
export function batchFor(projectId: string): ContentBatch | undefined {
    const batch = current.getStore();
    return batch?.open && batch.projectId === projectId ? batch : undefined;
}

/** Runs `work` in a new batch for the project; the batch closes when it ends. */
export function runInBatch<T>(
    projectId: string,
    work: (batch: ContentBatch) => Promise<T>
): Promise<T> {
    const batch: ContentBatch = { projectId, paths: new Set(), held: new Map(), open: true };
    return current.run(batch, async () => {
        try {
            return await work(batch);
        } finally {
            batch.open = false;
        }
    });
}
