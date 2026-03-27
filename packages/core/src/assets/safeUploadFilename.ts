import path from 'path';

const DEFAULT_UPLOAD_FILENAME = 'file';

/** Safe display/storage name for uploads: basename only, no path segments, limited charset. */
export function sanitizeUploadFilename(originalName: string): string {
    const base = path.basename(String(originalName ?? ''));
    const normalized = base.normalize('NFKC').replace(/\s+/g, ' ').trim();
    const safe = normalized
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^\.+/, '');
    const finalName = safe || DEFAULT_UPLOAD_FILENAME;
    return finalName.slice(0, 180);
}
