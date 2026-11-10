import type { MoteurClient } from '../client.js';

/** A place where an asset is used. `title` is returned as stored: a string, or a map from locale code to string. */
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

/** One page of the media library (see `assets.page`). */
export type AssetPage = {
    assets: Record<string, unknown>[];
    /** Total number of assets matching the filters, across all pages. */
    total: number;
    offset: number;
    limit: number;
    /** Included when `facets` is requested: the number of assets of each kind (including `unused`), and the folders in use. */
    facets?: { total: number; kinds: Record<string, number>; folders: string[] };
};

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/assets`;

export function projectAssetsApi(client: MoteurClient) {
    return {
        /** Lists assets. The API returns an array directly, not an object with an `assets` property. */
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
         * Returns one page of the media library, newest first, excluding assets in the bin. Filter
         * by `type` (or `unused`), by `folder` (`''` for assets with no folder) and by `search`
         * (accents are ignored). `limit` must be between 1 and 500.
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
        /** Adds a file from a public HTTPS URL. The server downloads it. */
        import(
            projectId: string,
            body: {
                url: string;
                name?: string;
                folder?: string;
                alt?: string;
                title?: string;
                credit?: string;
            }
        ): Promise<Record<string, unknown>> {
            return client.post(`${base(projectId)}/import`, body);
        },
        upload(projectId: string, formData: FormData): Promise<Record<string, unknown>> {
            // The client sends JSON by default, and axios would serialize FormData as JSON.
            // Setting the multipart content type lets axios (or the browser) add the boundary.
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
        /** Replaces the asset's file and keeps its ID. The new file must be the same kind of file as the old one. */
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
        /** Polls the video host immediately for the video's status. The server also polls on its own schedule. */
        checkVideo(projectId: string, id: string): Promise<Record<string, unknown>> {
            return client.post(`${base(projectId)}/${encodeURIComponent(id)}/video/check`);
        },
        /** Retries uploading a video that the host rejected, using the copy stored on the server. */
        retryVideo(projectId: string, id: string): Promise<Record<string, unknown>> {
            return client.post(`${base(projectId)}/${encodeURIComponent(id)}/video/retry`);
        },
        /** Moves the asset to the bin. Use `restore` to bring it back. */
        delete(projectId: string, id: string): Promise<void> {
            return client.delete(`${base(projectId)}/${encodeURIComponent(id)}`);
        },
        /** Lists the assets in the bin, most recently deleted first. */
        bin(projectId: string): Promise<Record<string, unknown>[]> {
            return client.get(`${base(projectId)}/bin`);
        },
        /** Restores an asset from the bin. */
        restore(projectId: string, id: string): Promise<Record<string, unknown>> {
            return client.post(`${base(projectId)}/${encodeURIComponent(id)}/restore`);
        },
        /** Permanently deletes an asset in the bin, including its files. Requires an admin. */
        deleteForever(projectId: string, id: string): Promise<void> {
            return client.delete(`${base(projectId)}/bin/${encodeURIComponent(id)}`);
        },
        /** Permanently deletes everything in the bin. Requires an admin. */
        emptyBin(projectId: string): Promise<{ deleted: number }> {
            return client.delete(`${base(projectId)}/bin`);
        },
        /**
         * Regenerates image variants, for all images when `assetIds` is omitted. Requires an admin.
         * Resolves with `{ processed, errors }` when finished, or immediately with `{ queued }`
         * when `background` is set.
         */
        regenerate(
            projectId: string,
            assetIds?: string[],
            options?: { background?: boolean }
        ): Promise<{ processed?: number; errors?: number; queued?: number }> {
            return client.post(`${base(projectId)}/regenerate`, { assetIds, ...options });
        },
        /** Returns the number of entry and page fields that use each asset. Unused assets are omitted. */
        usageCounts(projectId: string): Promise<{ counts: Record<string, number> }> {
            return client.get(`${base(projectId)}/usage`);
        },
        /** Lists every entry and page field that uses the asset. */
        usage(projectId: string, id: string): Promise<{ usages: AssetUsage[] }> {
            return client.get(`${base(projectId)}/${encodeURIComponent(id)}/usage`);
        },
        move(projectId: string, id: string, folder: string): Promise<Record<string, unknown>> {
            return client.post(`${base(projectId)}/${encodeURIComponent(id)}/move`, { folder });
        },
        /**
         * Applies one change to several assets in a single all-or-nothing save, for at most 500
         * assets. The change is one of: move to the bin, restore from the bin, move to a folder
         * (`''` for no folder), or per-asset updates (title, alt, caption, credit, folder and
         * so on). Resolves with the updated assets.
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
