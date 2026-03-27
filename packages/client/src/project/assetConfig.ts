import type { MoteurClient } from '../client.js';

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/asset-config`;

export function projectAssetConfigApi(client: MoteurClient) {
    return {
        get(projectId: string): Promise<Record<string, unknown>> {
            return client.get(base(projectId));
        },
        update(projectId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
            return client.patch(base(projectId), body);
        }
    };
}
