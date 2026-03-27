import type { MoteurClient } from '../client.js';

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/api-key`;

export type ApiKeyMeta = {
    prefix: string | null;
    createdAt: string | null;
    allowedHosts: string[] | null;
};

export function projectApiKeyApi(client: MoteurClient) {
    return {
        get(projectId: string): Promise<ApiKeyMeta> {
            return client.get(base(projectId));
        },
        patchAllowedHosts(
            projectId: string,
            allowedHosts: string[]
        ): Promise<{ allowedHosts: string[] }> {
            return client.patch(`${base(projectId)}/allowed-hosts`, { allowedHosts });
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
