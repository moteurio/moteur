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

/** Text describing an asset: one string, or one per language code. */
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
    /** SHA-256 of the file as uploaded (before a photo's metadata is removed): the same file uploaded again has the same one. */
    hash?: string;

    // ── Asset-level metadata ──
    /** A string, or one per language: `{ "fr": "…", "en": "…" }`. Fields may override alt and caption. */
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
    duration?: number; // seconds; null if ffprobe unavailable
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
     * While a video moves to another host: where it still is. Cleared once the new host has it
     * ready; deleted there then when `remove` is set.
     */
    previousHost?: { provider: VideoProviderId; providerId: string; remove?: boolean };

    // ── Storage (local copy or non-video assets) ──
    path?: string;
    localUrl?: string;

    // ── Computed (set at read time via resolveAssetUrl) ──
    url: string;
    /** Images only: serves any size; add `&w=640`, optionally `&ar=1:1` and `&fmt=avif`. */
    resizeUrl?: string;

    // ── Organisation ──
    folder?: string;

    // ── Authorship ──
    uploadedBy: string;
    uploadedByName: string;

    createdAt: string;
    updatedAt: string;

    // ── Bin ──
    /** Set while the asset is in the bin: hidden from the library and from content, restorable. */
    deletedAt?: string;
    deletedBy?: string;
    deletedByName?: string;

    // ── AI-generated image metadata ──
    /** Prompt sent to the image generation provider (stored when asset was created via Generate). */
    generationPrompt?: string;
    /** Provider identifier e.g. 'openai/dall-e-3'. */
    aiProvider?: string;
    /** When true, this asset was created from AI image generation. */
    aiGenerated?: boolean;
};
