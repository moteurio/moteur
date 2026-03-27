import type { MoteurClient } from '../client.js';

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/collections`;

/** List / get collection definitions (API key or JWT). */
export function publicCollectionsReadApi(client: MoteurClient) {
    return {
        list(projectId: string): Promise<{ collections: Record<string, unknown>[] }> {
            return client.get(base(projectId));
        },
        get(
            projectId: string,
            collectionId: string
        ): Promise<{ collection: Record<string, unknown> }> {
            return client.get(`${base(projectId)}/${encodeURIComponent(collectionId)}`);
        }
    };
}
