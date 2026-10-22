import type { AssetType } from '@moteurio/types/Asset.js';

export const ALLOWED_MIME: Record<AssetType, string[]> = {
    image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'],
    video: ['video/mp4', 'video/quicktime'],
    audio: [
        'audio/mpeg',
        'audio/mp4',
        'audio/aac',
        'audio/wav',
        'audio/x-wav',
        'audio/ogg',
        'audio/webm',
        'audio/flac'
    ],
    document: [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ],
    model: ['model/gltf-binary', 'model/gltf+json', 'model/vnd.usdz+zip']
};

/** Browsers rarely know 3D formats (and some audio) and send these files as octet-stream or with no type. */
const MIME_BY_EXTENSION: Record<string, string> = {
    glb: 'model/gltf-binary',
    gltf: 'model/gltf+json',
    usdz: 'model/vnd.usdz+zip',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    flac: 'audio/flac'
};

const GENERIC_MIME = new Set(['', 'application/octet-stream', 'binary/octet-stream']);

/** The upload's MIME type, or the one its extension implies when the client sent a generic one. */
export function resolveUploadMime(mimeType: string | undefined, filename: string): string {
    const given = (mimeType ?? '').trim().toLowerCase();
    if (!GENERIC_MIME.has(given)) return given;
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    return MIME_BY_EXTENSION[ext] ?? given;
}

export function getAssetTypeFromMime(mimeType: string): AssetType | null {
    for (const [type, mimes] of Object.entries(ALLOWED_MIME)) {
        if (mimes.includes(mimeType)) return type as AssetType;
    }
    return null;
}

export function isAllowedMime(mimeType: string, allowedTypes?: AssetType[]): boolean {
    const type = getAssetTypeFromMime(mimeType);
    if (!type) return false;
    if (!allowedTypes || allowedTypes.length === 0) return true;
    return allowedTypes.includes(type);
}
