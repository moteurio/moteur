import type { MoteurClient } from '../client.js';

export type PreviewTokenCreateBody = {
    ttlSeconds?: number;
    entryId?: string;
    pageId?: string;
    collectionId?: string;
};

export type PreviewTokenCreateResponse = {
    id: string;
    prefix: string;
    createdAt: string;
    expiresAt: string;
    rawToken: string;
    message: string;
    entryId?: string;
    pageId?: string;
    collectionId?: string;
};

export function projectPreviewTokensApi(client: MoteurClient) {
    const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/preview-tokens`;

    return {
        create(
            projectId: string,
            body?: PreviewTokenCreateBody
        ): Promise<PreviewTokenCreateResponse> {
            return client.post(base(projectId), body ?? {});
        }
    };
}
