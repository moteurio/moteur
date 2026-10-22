import type { VideoProviderId, VideoProviderStatus } from '@moteurio/types/Asset.js';

export interface VideoProviderUploadResult {
    providerId: string;
    providerStatus: VideoProviderStatus;
    providerMetadata: {
        streamUrl?: string;
        thumbnailUrl?: string;
        playbackId?: string;
        embedUrl?: string;
        [key: string]: any;
    };
    duration?: number;
}

/** Where a video stands at its host: from a webhook, or from asking the host (`getStatus`). */
export interface VideoHostReport {
    providerId: string;
    providerStatus: VideoProviderStatus;
    providerMetadata: Record<string, any>;
    duration?: number;
    /** Optional: upload id or passthrough to find the asset (e.g. we stored upload_id, webhook gives asset_id) */
    correlationId?: string;
}

export interface VideoProvider {
    id: VideoProviderId;
    label: string;

    upload(
        buffer: Buffer,
        filename: string,
        mimeType: string,
        options?: { passthrough?: string }
    ): Promise<VideoProviderUploadResult>;

    handleWebhook(
        payload: unknown,
        signature: string,
        secret: string
    ): Promise<VideoHostReport | null>;

    /**
     * Asks the host where a video stands (`providerId` as stored: an upload's id until the host
     * gives the video's own). Optional: without it, only webhooks move a video on, and a server
     * the host can't reach waits forever. Null when the host has nothing to say yet.
     */
    getStatus?(providerId: string): Promise<VideoHostReport | null>;

    delete(providerId: string): Promise<void>;

    /** Verify webhook signature before any processing. Return false to respond 400. */
    verifySignature(rawBody: string, signature: string, secret: string): boolean;
}
