import type { MoteurClient } from '../client.js';

/** Something deleted, waiting in the project's bin. */
export type BinItem = {
    /** `entry.<modelId>.<entryId>.<ms>`, `page.<pageId>.<ms>` or `model.<modelId>.<ms>`. */
    id: string;
    kind: 'entry' | 'page' | 'model';
    /** An entry's model, or the model itself (kind `model`). */
    modelId?: string;
    /** Who deleted it, and when. */
    binned: { at: string; by?: string; byName?: string };
    /** The entry as it was when deleted (kind `entry`). */
    entry?: Record<string, unknown>;
    /** The page as it was when deleted (kind `page`). */
    page?: Record<string, unknown>;
    /** The model as it was when deleted (kind `model`). */
    model?: Record<string, unknown>;
    /** How many entries went with the model, and come back with it (kind `model`). */
    entryCount?: number;
};

export type BinRestored =
    | { kind: 'entry'; modelId: string; entry: Record<string, unknown> }
    | { kind: 'page'; page: Record<string, unknown> }
    | { kind: 'model'; model: Record<string, unknown>; entryCount: number };

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/bin`;

/** The bin for entries, pages and models (media has its own: `assets.bin`). */
export function projectBinApi(client: MoteurClient) {
    return {
        /** What is in the bin, most recently deleted first. */
        async list(projectId: string): Promise<BinItem[]> {
            return (await client.get<{ items: BinItem[] }>(base(projectId))).items;
        },
        /**
         * Takes it out of the bin, as a draft; a model comes back with its entries, as drafts
         * (409 when its id, address or model is taken or gone).
         */
        restore(projectId: string, binId: string): Promise<BinRestored> {
            return client.post(`${base(projectId)}/${encodeURIComponent(binId)}/restore`);
        },
        /** Deletes it for good (content leads and admins; a model also takes a builder). */
        deleteForever(projectId: string, binId: string): Promise<void> {
            return client.delete(`${base(projectId)}/${encodeURIComponent(binId)}`);
        },
        /** Deletes everything in the bin for good (content leads and admins; builders too, with models in it). */
        empty(projectId: string): Promise<{ deleted: number }> {
            return client.delete(base(projectId));
        }
    };
}
