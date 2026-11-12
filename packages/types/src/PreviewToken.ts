/** A stored preview token. Only a hash of the secret is stored. */
export interface PreviewTokenEntry {
    id: string;
    hash: string;
    prefix: string;
    createdAt: string;
    expiresAt: string;
    createdBy?: string;
    /** Model of the entry. Used together with `entryId`. */
    modelId?: string;
    entryId?: string;
    pageId?: string;
    channelId?: string;
}

export type PreviewTokenCreateInput = {
    /** Lifetime of the token in seconds. Defaults to 1800 and cannot exceed 3600. */
    ttlSeconds?: number;
    /** Model of the entry. Used together with `entryId`. */
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
    /** Model of the entry. Used together with `entryId`. */
    modelId?: string;
    entryId?: string;
    pageId?: string;
    channelId?: string;
};
