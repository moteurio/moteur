/** Collection definition CRUD under `/projects/:id/collections` (JWT for writes; list/get also work with API key). */
import type { MoteurClient } from '../client.js';

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/collections`;

export function projectCollectionsApi(client: MoteurClient) {
    return {
        list(projectId: string): Promise<{ collections: Record<string, unknown>[] }> {
            return client.get(base(projectId));
        },
        get(
            projectId: string,
            collectionId: string
        ): Promise<{ collection: Record<string, unknown> }> {
            return client.get(`${base(projectId)}/${encodeURIComponent(collectionId)}`);
        },
        create(
            projectId: string,
            body: Record<string, unknown>
        ): Promise<{ collection: Record<string, unknown> }> {
            return client.post(base(projectId), body);
        },
        update(
            projectId: string,
            collectionId: string,
            body: Record<string, unknown>
        ): Promise<{ collection: Record<string, unknown> }> {
            return client.patch(`${base(projectId)}/${encodeURIComponent(collectionId)}`, body);
        },
        delete(projectId: string, collectionId: string): Promise<void> {
            return client.delete(`${base(projectId)}/${encodeURIComponent(collectionId)}`);
        }
    };
}
