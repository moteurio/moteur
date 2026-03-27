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
    ): Promise<{
        providerId: string;
        providerStatus: VideoProviderStatus;
        providerMetadata: Record<string, any>;
        duration?: number;
        /** Optional: upload id or passthrough to find the asset (e.g. we stored upload_id, webhook gives asset_id) */
        correlationId?: string;
    } | null>;

    delete(providerId: string): Promise<void>;

    /** Verify webhook signature before any processing. Return false to respond 400. */
    verifySignature(rawBody: string, signature: string, secret: string): boolean;
}
