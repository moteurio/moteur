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
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    avif: 'image/avif',
    svg: 'image/svg+xml',
    pdf: 'application/pdf',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    glb: 'model/gltf-binary',
    gltf: 'model/gltf+json',
    usdz: 'model/vnd.usdz+zip',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    flac: 'audio/flac'
};

/** The extension a file is stored under for each accepted type (the first is used when it has none of them). */
const EXTENSIONS_BY_MIME: Record<string, string[]> = {
    'image/jpeg': ['jpg', 'jpeg'],
    'image/png': ['png'],
    'image/webp': ['webp'],
    'image/gif': ['gif'],
    'image/avif': ['avif'],
    'video/mp4': ['mp4', 'm4v'],
    'video/quicktime': ['mov'],
    'audio/mpeg': ['mp3'],
    'audio/mp4': ['m4a', 'mp4'],
    'audio/aac': ['aac', 'm4a'],
    'audio/wav': ['wav'],
    'audio/x-wav': ['wav'],
    'audio/ogg': ['ogg', 'oga'],
    'audio/webm': ['webm', 'weba'],
    'audio/flac': ['flac'],
    'application/pdf': ['pdf'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
    'model/gltf-binary': ['glb'],
    'model/gltf+json': ['gltf'],
    'model/vnd.usdz+zip': ['usdz']
};

/**
 * The name a file is stored under: its own, with the extension of the type it was accepted as.
 * `page.html` sent as a PDF is kept as `page.pdf`, so nothing serves it as a web page.
 */
export function nameForType(filename: string, mimeType: string): string {
    const allowed = EXTENSIONS_BY_MIME[mimeType];
    if (!allowed) return filename;
    const dot = filename.lastIndexOf('.');
    const ext = dot > 0 ? filename.slice(dot + 1).toLowerCase() : '';
    if (allowed.includes(ext)) return filename;
    const stem = dot > 0 ? filename.slice(0, dot) : filename;
    return `${stem || 'file'}.${allowed[0]}`;
}

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
