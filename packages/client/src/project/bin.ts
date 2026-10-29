import type { MoteurClient } from '../client.js';

/** Something deleted, waiting in the project's bin. */
export type BinItem = {
    /** `entry.<modelId>.<entryId>.<ms>` or `page.<pageId>.<ms>`. */
    id: string;
    kind: 'entry' | 'page';
    /** An entry's model. */
    modelId?: string;
    /** Who deleted it, and when. */
    binned: { at: string; by?: string; byName?: string };
    /** The entry as it was when deleted (kind `entry`). */
    entry?: Record<string, unknown>;
    /** The page as it was when deleted (kind `page`). */
    page?: Record<string, unknown>;
};

export type BinRestored =
    | { kind: 'entry'; modelId: string; entry: Record<string, unknown> }
    | { kind: 'page'; page: Record<string, unknown> };

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/bin`;

/** The bin for entries and pages (media has its own: `assets.bin`). */
export function projectBinApi(client: MoteurClient) {
    return {
        /** What is in the bin, most recently deleted first. */
        async list(projectId: string): Promise<BinItem[]> {
            return (await client.get<{ items: BinItem[] }>(base(projectId))).items;
        },
        /** Takes it out of the bin, as a draft (409 when its id, address or model is taken or gone). */
        restore(projectId: string, binId: string): Promise<BinRestored> {
            return client.post(`${base(projectId)}/${encodeURIComponent(binId)}/restore`);
        },
        /** Deletes it for good (admins). */
        deleteForever(projectId: string, binId: string): Promise<void> {
            return client.delete(`${base(projectId)}/${encodeURIComponent(binId)}`);
        },
        /** Deletes everything in the bin for good (admins). */
        empty(projectId: string): Promise<{ deleted: number }> {
            return client.delete(base(projectId));
        }
    };
}
