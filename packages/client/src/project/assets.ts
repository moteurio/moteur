import type { MoteurClient } from '../client.js';

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
            return client._raw
                .post(base(projectId), formData)
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
        move(projectId: string, id: string, folder: string): Promise<Record<string, unknown>> {
            return client.post(`${base(projectId)}/${encodeURIComponent(id)}/move`, { folder });
        }
    };
}
