import type { MoteurClient } from '../client.js';

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/blocks`;

export function projectBlocksApi(client: MoteurClient) {
    return {
        list(projectId: string): Promise<Record<string, unknown>> {
            return client.get<Record<string, unknown>>(base(projectId));
        },
        get(projectId: string, id: string): Promise<Record<string, unknown>> {
            return client.get(`${base(projectId)}/${encodeURIComponent(id)}`);
        },
        create(projectId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
            return client.post(base(projectId), body);
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
        }
    };
}
