/** Stored preview token (secret is hash-only). */
export interface PreviewTokenEntry {
    id: string;
    hash: string;
    prefix: string;
    createdAt: string;
    expiresAt: string;
    createdBy?: string;
    /** With `entryId`: the entry's model. */
    modelId?: string;
    entryId?: string;
    pageId?: string;
    channelId?: string;
}

export type PreviewTokenCreateInput = {
    /** TTL in seconds; default 1800, max 3600. */
    ttlSeconds?: number;
    /** With `entryId`: the entry's model. */
    modelId?: string;
    entryId?: string;
    pageId?: string;
    channelId?: string;
};

export type PreviewTokenCreateResult = {
    rawToken: string;
    token: PreviewTokenMeta;
};

export type PreviewTokenMeta = {
    id: string;
    prefix: string;
    createdAt: string;
    expiresAt: string;
    /** With `entryId`: the entry's model. */
    modelId?: string;
    entryId?: string;
    pageId?: string;
    channelId?: string;
};
