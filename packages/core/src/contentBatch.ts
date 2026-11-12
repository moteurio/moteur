/**
 * Groups many content changes into one batch, such as an import. While a batch is open, each
 * change's git commit, webhooks, Radar scan and activity log entry are held back instead of
 * happening one change at a time. The code that opened the batch then commits everything at once,
 * or undoes it.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export type ContentBatch = {
    projectId: string;
    /** Files changed, relative to the project folder. */
    paths: Set<string>;
    /** Webhooks held back, by event. */
    held: Map<string, number>;
    /** False once the batch has ended. Work it started that finishes later (such as image variants) is saved normally. */
    open: boolean;
};

const current = new AsyncLocalStorage<ContentBatch>();

/** The open batch the running work belongs to, if it is for this project. */
export function batchFor(projectId: string): ContentBatch | undefined {
    const batch = current.getStore();
    return batch?.open && batch.projectId === projectId ? batch : undefined;
}

/** Runs `work` inside a new batch for the project. The batch closes when `work` finishes. */
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
