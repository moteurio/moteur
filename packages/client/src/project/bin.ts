import type { MoteurClient } from '../client.js';

/** An item that was deleted and is waiting in the project's bin. */
export type BinItem = {
    /** Bin item ID, in the form `entry.<modelId>.<entryId>.<ms>`, `page.<pageId>.<ms>` or `model.<modelId>.<ms>`, where `<ms>` is the deletion time in milliseconds. */
    id: string;
    kind: 'entry' | 'page' | 'model';
    /** The entry's model ID, or the model's own ID when `kind` is `model`. */
    modelId?: string;
    /** When the item was deleted and by whom. */
    binned: { at: string; by?: string; byName?: string };
    /** The entry as it was when deleted. Present when `kind` is `entry`. */
    entry?: Record<string, unknown>;
    /** The page as it was when deleted. Present when `kind` is `page`. */
    page?: Record<string, unknown>;
    /** The model as it was when deleted. Present when `kind` is `model`. */
    model?: Record<string, unknown>;
    /** Number of entries that were deleted with the model and are restored with it. Present when `kind` is `model`. */
    entryCount?: number;
};

export type BinRestored =
    | { kind: 'entry'; modelId: string; entry: Record<string, unknown> }
    | { kind: 'page'; page: Record<string, unknown> }
    | { kind: 'model'; model: Record<string, unknown>; entryCount: number };

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/bin`;

/** The bin for entries, pages and models. Media has its own bin (`assets.bin`). */
export function projectBinApi(client: MoteurClient) {
    return {
        /** Lists the items in the bin, most recently deleted first. */
        async list(projectId: string): Promise<BinItem[]> {
            return (await client.get<{ items: BinItem[] }>(base(projectId))).items;
        },
        /**
         * Restores an item from the bin as a draft. A model is restored together with its entries,
         * also as drafts. Fails with 409 when the item's ID or URL is already taken, or when the
         * entry's model no longer exists.
         */
        restore(projectId: string, binId: string): Promise<BinRestored> {
            return client.post(`${base(projectId)}/${encodeURIComponent(binId)}/restore`);
        },
        /** Permanently deletes an item from the bin. Requires the Content lead or Admin role; deleting a model also allows the Builder role. */
        deleteForever(projectId: string, binId: string): Promise<void> {
            return client.delete(`${base(projectId)}/${encodeURIComponent(binId)}`);
        },
        /** Permanently deletes everything in the bin. Requires the Content lead or Admin role; the Builder role is also allowed when the bin contains models. */
        empty(projectId: string): Promise<{ deleted: number }> {
            return client.delete(base(projectId));
        }
    };
}
