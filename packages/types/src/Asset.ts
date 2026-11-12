export type AssetType = 'image' | 'video' | 'audio' | 'document' | 'model';
export type AssetStatus = 'processing' | 'ready' | 'error';
export type VideoProviderStatus = 'uploading' | 'processing' | 'ready' | 'error';
export type VideoProviderId = 'mux' | 'vimeo' | 'cloudflare-stream' | 'youtube';

export type FocalPoint = {
    x: number; // 0.0–1.0, proportion from left
    y: number; // 0.0–1.0, proportion from top
};

export type ImageVariant = {
    key: string;
    url: string;
    width: number;
    height: number;
    size: number;
    format: string;
    generatedAt: string;
};

/** Text describing an asset: a single string, or a map from locale code to string. */
export type AssetText = string | Record<string, string>;

export type Asset = {
    id: string;
    projectId: string;
    filename: string;
    mimeType: string;
    size: number;
    type: AssetType;
    status: AssetStatus;
    adapter: string; // 'local' | 's3' | 'r2' | 'minio' | 'cloudinary'
    /** SHA-256 hash of the file as uploaded, before any image metadata is stripped. Uploading the same file again produces the same hash. */
    hash?: string;

    // ── Asset-level metadata ──
    /** A string, or a map from locale code to string such as `{ "fr": "...", "en": "..." }`. Fields can override `alt` and `caption`. */
    title?: AssetText;
    alt?: AssetText;
    caption?: AssetText;
    description?: string;
    credit?: string;

    // ── Image-only ──
    width?: number;
    height?: number;
    focalPoint?: FocalPoint;
    variants?: ImageVariant[];

    // ── Video-only ──
    duration?: number; // Duration in seconds; null when ffprobe is unavailable
    provider?: VideoProviderId;
    providerId?: string;
    providerStatus?: VideoProviderStatus;
    providerMetadata?: {
        streamUrl?: string;
        thumbnailUrl?: string;
        playbackId?: string;
        embedUrl?: string;
        [key: string]: any;
    };
    keepLocalCopy?: boolean;
    /**
     * Set while a video is being moved to another host, and identifies where the video currently
     * is. It is cleared once the new host reports the video as ready. At that point the old copy is
     * deleted if `remove` is true.
     */
    previousHost?: { provider: VideoProviderId; providerId: string; remove?: boolean };

    // ── Storage (local copy or non-video assets) ──
    path?: string;
    localUrl?: string;

    // ── Computed (set at read time via resolveAssetUrl) ──
    url: string;
    /** Images only. URL that serves the image at any size. Append `&w=640` for the width, and optionally `&ar=1:1` for the aspect ratio and `&fmt=avif` for the format. */
    resizeUrl?: string;

    // ── Organisation ──
    folder?: string;

    // ── Authorship ──
    uploadedBy: string;
    uploadedByName: string;

    createdAt: string;
    updatedAt: string;

    // ── Bin ──
    /** ISO 8601 timestamp set while the asset is in the bin. A binned asset is hidden from the library and from content, and can be restored. */
    deletedAt?: string;
    deletedBy?: string;
    deletedByName?: string;

    // ── AI-generated image metadata ──
    /** Prompt sent to the image generation provider. Stored when the asset was created by AI generation. */
    generationPrompt?: string;
    /** Provider and model identifier, for example `openai/dall-e-3`. */
    aiProvider?: string;
    /** True when the asset was created by AI image generation. */
    aiGenerated?: boolean;
};
