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

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/assets`;

export function projectAssetsApi(client: MoteurClient) {
    return {
        /** List assets; API returns an array directly (not { assets: [] }). */
        list(
            projectId: string,
            params?: { type?: string; folder?: string; search?: string }
        ): Promise<Record<string, unknown>[]> {
            return client.get<Record<string, unknown>[]>(
                base(projectId),
                params as Record<string, string>
            );
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
        delete(projectId: string, id: string): Promise<void> {
            return client.delete(`${base(projectId)}/${encodeURIComponent(id)}`);
        },
        regenerate(projectId: string, assetIds?: string[]): Promise<{ regenerated?: number }> {
            return client.post(`${base(projectId)}/regenerate`, { assetIds });
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
        }
    };
}
