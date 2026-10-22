import type { MoteurClient } from '../client.js';

/** Where an asset is used. `title` is as stored: text, or text per language. */
export type AssetUsage = {
    kind: 'entry' | 'page';
    modelId?: string;
    entryId?: string;
    pageId?: string;
    status?: string;
    title?: unknown;
    field: string;
    path: string;
};

/** One page of the library (see `assets.page`). */
export type AssetPage = {
    assets: Record<string, unknown>[];
    /** Files matching the filters, on every page. */
    total: number;
    offset: number;
    limit: number;
    /** With `facets`: files of each kind (and `unused`), and the folders in use. */
    facets?: { total: number; kinds: Record<string, number>; folders: string[] };
};

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/assets`;

export function projectAssetsApi(client: MoteurClient) {
    return {
        /** List assets; API returns an array directly (not { assets: [] }). */
        list(
            projectId: string,
            params?: { type?: string; folder?: string; search?: string; hash?: string }
        ): Promise<Record<string, unknown>[]> {
            return client.get<Record<string, unknown>[]>(
                base(projectId),
                params as Record<string, string>
            );
        },
        /**
         * One page of the library, newest first, without files in the bin: by `type` (or
         * `unused`), `folder` (`''` for none) and `search` (accents ignored). `limit` is 1–500.
         */
        page(
            projectId: string,
            params: {
                limit: number;
                offset?: number;
                type?: string;
                folder?: string;
                search?: string;
                facets?: boolean;
            }
        ): Promise<AssetPage> {
            const query: Record<string, string> = {};
            for (const [k, v] of Object.entries(params))
                if (v !== undefined && v !== false) query[k] = v === true ? '1' : String(v);
            return client.get<AssetPage>(base(projectId), query);
        },
        get(projectId: string, id: string): Promise<Record<string, unknown>> {
            return client.get(`${base(projectId)}/${encodeURIComponent(id)}`);
        },
        upload(projectId: string, formData: FormData): Promise<Record<string, unknown>> {
            // The instance defaults to JSON, and axios turns FormData into JSON for a JSON
            // request: say multipart, and axios (or the browser) adds the boundary.
            return client._raw
                .post(base(projectId), formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                })
                .then(r => r.data as Record<string, unknown>);
        },
        update(
            projectId: string,
            id: string,
            body: Record<string, unknown>
        ): Promise<Record<string, unknown>> {
            return client.patch(`${base(projectId)}/${encodeURIComponent(id)}`, body);
        },
        /** A new file for the asset, keeping its id (same kind of file only). */
        replace(
            projectId: string,
            id: string,
            formData: FormData
        ): Promise<Record<string, unknown>> {
            return client._raw
                .post(`${base(projectId)}/${encodeURIComponent(id)}/replace`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                })
                .then(r => r.data as Record<string, unknown>);
        },
        /** Asks a video's host now where it stands (the server also asks on its own). */
        checkVideo(projectId: string, id: string): Promise<Record<string, unknown>> {
            return client.post(`${base(projectId)}/${encodeURIComponent(id)}/video/check`);
        },
        /** Sends a video its host refused once more, from the copy kept on the server. */
        retryVideo(projectId: string, id: string): Promise<Record<string, unknown>> {
            return client.post(`${base(projectId)}/${encodeURIComponent(id)}/video/retry`);
        },
        /** Moves the asset to the bin; `restore` brings it back. */
        delete(projectId: string, id: string): Promise<void> {
            return client.delete(`${base(projectId)}/${encodeURIComponent(id)}`);
        },
        /** Assets in the bin, most recently deleted first. */
        bin(projectId: string): Promise<Record<string, unknown>[]> {
            return client.get(`${base(projectId)}/bin`);
        },
        /** Takes an asset out of the bin. */
        restore(projectId: string, id: string): Promise<Record<string, unknown>> {
            return client.post(`${base(projectId)}/${encodeURIComponent(id)}/restore`);
        },
        /** Deletes an asset in the bin for good, files included (admins). */
        deleteForever(projectId: string, id: string): Promise<void> {
            return client.delete(`${base(projectId)}/bin/${encodeURIComponent(id)}`);
        },
        /** Deletes everything in the bin for good (admins). */
        emptyBin(projectId: string): Promise<{ deleted: number }> {
            return client.delete(`${base(projectId)}/bin`);
        },
        /**
         * Remakes images' sizes (all of them without `assetIds`; admins). Answers when done with
         * `{ processed, errors }`, or at once with `{ queued }` when `background` is set.
         */
        regenerate(
            projectId: string,
            assetIds?: string[],
            options?: { background?: boolean }
        ): Promise<{ processed?: number; errors?: number; queued?: number }> {
            return client.post(`${base(projectId)}/regenerate`, { assetIds, ...options });
        },
        /** How many entry and page fields use each asset; unused assets are left out. */
        usageCounts(projectId: string): Promise<{ counts: Record<string, number> }> {
            return client.get(`${base(projectId)}/usage`);
        },
        /** Every entry and page field using the asset. */
        usage(projectId: string, id: string): Promise<{ usages: AssetUsage[] }> {
            return client.get(`${base(projectId)}/${encodeURIComponent(id)}/usage`);
        },
        move(projectId: string, id: string, folder: string): Promise<Record<string, unknown>> {
            return client.post(`${base(projectId)}/${encodeURIComponent(id)}/move`, { folder });
        },
        /**
         * Several assets at once, in one save (all or nothing, at most 500): to the bin, out of
         * it, to a folder (`''` for none), or each its own changes (title, alt, caption, credit,
         * folder…). Answers with the assets as they are now.
         */
        batch(
            projectId: string,
            batch:
                | { action: 'bin' | 'restore'; ids: string[] }
                | { action: 'move'; ids: string[]; folder: string }
                | { action: 'update'; changes: { id: string; patch: Record<string, unknown> }[] }
        ): Promise<{ assets: Record<string, unknown>[] }> {
            return client.post(`${base(projectId)}/batch`, batch);
        }
    };
}
