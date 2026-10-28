import type { MoteurClient } from '../client.js';

export type PreviewTokenCreateBody = {
    ttlSeconds?: number;
    /** With `entryId`: the entry's model (required with it). */
    modelId?: string;
    entryId?: string;
    pageId?: string;
    channelId?: string;
};

export type PreviewTokenCreateResponse = {
    id: string;
    prefix: string;
    createdAt: string;
    expiresAt: string;
    rawToken: string;
    message: string;
    /** With `entryId`: the entry's model (required with it). */
    modelId?: string;
    entryId?: string;
    pageId?: string;
    channelId?: string;
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
