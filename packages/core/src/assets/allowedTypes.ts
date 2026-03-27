import type { AssetType } from '@moteurio/types/Asset.js';

export const ALLOWED_MIME: Record<AssetType, string[]> = {
    image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'],
    video: ['video/mp4', 'video/quicktime'],
    document: [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
};

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
