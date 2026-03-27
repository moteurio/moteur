import type { MoteurClient } from '../client.js';

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/api-key`;

export function projectApiKeyApi(client: MoteurClient) {
    return {
        get(projectId: string): Promise<{ prefix: string | null; createdAt: string | null }> {
            return client.get(base(projectId));
        },
        generate(projectId: string): Promise<{ prefix: string; rawKey: string; message: string }> {
            return client.post(`${base(projectId)}/generate`);
        },
        rotate(projectId: string): Promise<{ prefix: string; rawKey: string; message: string }> {
            return client.post(`${base(projectId)}/rotate`);
        },
        revoke(projectId: string): Promise<void> {
            return client.delete(base(projectId));
        }
    };
}
