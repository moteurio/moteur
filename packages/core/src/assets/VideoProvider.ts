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

/** The status of a video at its host, reported by a webhook or returned by `getStatus`. */
export interface VideoHostReport {
    providerId: string;
    providerStatus: VideoProviderStatus;
    providerMetadata: Record<string, any>;
    duration?: number;
    /** Optional upload id or passthrough value used to find the asset (for example, the stored upload_id when the webhook only gives an asset_id). */
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
     * Asks the host for a video's status. `providerId` is the stored id: the upload id until the
     * host assigns the video its own id. Optional: without it, only webhooks update a video, so
     * a server the host can't reach would wait forever. Returns null when the host has no status yet.
     */
    getStatus?(providerId: string): Promise<VideoHostReport | null>;

    delete(providerId: string): Promise<void>;

    /** Verify webhook signature before any processing. Return false to respond 400. */
    verifySignature(rawBody: string, signature: string, secret: string): boolean;
}
