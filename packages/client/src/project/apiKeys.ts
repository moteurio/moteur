import type { MoteurClient } from '../client.js';

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/api-keys`;

export type ProjectApiKeyMeta = {
    id: string;
    prefix: string;
    createdAt: string;
    label?: string;
    allowedHosts: string[];
    allowedCollectionIds?: string[];
    allowSiteWideReads?: boolean;
};

export type ProjectApiKeyCreateBody = {
    label?: string;
    allowedCollectionIds?: string[];
    allowSiteWideReads?: boolean;
};

export type ProjectApiKeyCreateResponse = ProjectApiKeyMeta & {
    rawKey: string;
    message: string;
};

export type ProjectApiKeyPatchBody = {
    label?: string | null;
    allowedHosts?: string[];
    allowedCollectionIds?: string[] | null;
    allowSiteWideReads?: boolean;
};

export function projectApiKeysApi(client: MoteurClient) {
    return {
        list(projectId: string): Promise<ProjectApiKeyMeta[]> {
            return client.get(base(projectId));
        },
        create(
            projectId: string,
            body?: ProjectApiKeyCreateBody
        ): Promise<ProjectApiKeyCreateResponse> {
            return client.post(base(projectId), body ?? {});
        },
        rotate(projectId: string, keyId: string): Promise<ProjectApiKeyCreateResponse> {
            return client.post(`${base(projectId)}/${encodeURIComponent(keyId)}/rotate`);
        },
        revoke(projectId: string, keyId: string): Promise<void> {
            return client.delete(`${base(projectId)}/${encodeURIComponent(keyId)}`);
        },
        patch(
            projectId: string,
            keyId: string,
            body: ProjectApiKeyPatchBody
        ): Promise<ProjectApiKeyMeta> {
            return client.patch(`${base(projectId)}/${encodeURIComponent(keyId)}`, body);
        }
    };
}
