import fs from 'fs';
import path from 'path';
import { baseAssetsDir } from '../../utils/pathUtils.js';
import type { StorageAdapter, UploadResult } from '../StorageAdapter.js';

const DEFAULT_BASE_URL = process.env.STATIC_ASSETS_BASE_URL || 'http://localhost:3000';

/** Prefix before `/static/assets/...` (same as `API_BASE_PATH` on the HTTP server). */
function httpBasePathPrefix(): string {
    const raw = (process.env.API_BASE_PATH ?? '').trim();
    if (!raw) return '';
    return raw.startsWith('/') ? raw.replace(/\/$/, '') : `/${raw.replace(/\/$/, '')}`;
}

export interface LocalAdapterOptions {
    baseUrl?: string;
}

/**
 * Local disk asset storage. Originals: assets/original/{sanitized-filename}.
 * Variants: assets/{variantKey}/{id}.{ext}.
 * URLs are served via GET {API_BASE_PATH}/static/assets/:projectId/:variantKey/:filename
 */
export class LocalAdapter implements StorageAdapter {
    id = 'local';
    label = 'Local disk';
    private baseUrl: string;
    private readonly pathPrefix: string;

    constructor(options: LocalAdapterOptions = {}) {
        this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
        this.pathPrefix = httpBasePathPrefix();
    }

    private assetUrl(
        projectId: string,
        variantKey: string,
        filename: string,
        encodeSegments: boolean
    ): string {
        const enc = (s: string) => (encodeSegments ? encodeURIComponent(s) : s);
        const p = this.pathPrefix ? `${this.pathPrefix}/static/assets` : '/static/assets';
        return `${this.baseUrl}${p}/${enc(projectId)}/${enc(variantKey)}/${enc(filename)}`;
    }

    /** Single path segment: no separators, no "." / ".." */
    private static assertSafeSegment(value: string, label: string): void {
        if (
            !value ||
            value.includes('/') ||
            value.includes('\\') ||
            value === '.' ||
            value === '..'
        ) {
            throw new Error(`Invalid asset ${label}`);
        }
    }

    private static parseStoredPath(storedPath: string): {
        projectId: string;
        variantKey: string;
        filename: string;
    } {
        const [projectId, variantKey, ...rest] = String(storedPath ?? '').split('/');
        const filename = path.posix.basename(rest.join('/').replace(/\\/g, '/'));
        if (!projectId || !variantKey || !filename) {
            throw new Error('Invalid asset path');
        }
        LocalAdapter.assertSafeSegment(projectId, 'projectId');
        LocalAdapter.assertSafeSegment(variantKey, 'variantKey');
        return { projectId, variantKey, filename };
    }

    private static safeAssetFilePath(
        projectId: string,
        variantKey: string,
        filename: string
    ): string {
        const normalizedFilename = path.posix.basename(String(filename ?? '').replace(/\\/g, '/'));
        if (!projectId || !variantKey || !normalizedFilename) {
            throw new Error('Invalid asset path');
        }
        LocalAdapter.assertSafeSegment(projectId, 'projectId');
        LocalAdapter.assertSafeSegment(variantKey, 'variantKey');
        const assetsRoot = path.resolve(baseAssetsDir(projectId));
        const filePath = path.resolve(assetsRoot, variantKey, normalizedFilename);
        if (filePath !== assetsRoot && !filePath.startsWith(assetsRoot + path.sep)) {
            throw new Error('Invalid asset path');
        }
        return filePath;
    }

    async upload(
        projectId: string,
        filename: string,
        buffer: Buffer,
        _mimeType: string,
        variantKey = 'original'
    ): Promise<UploadResult> {
        const safeFilename = path.posix.basename(String(filename ?? '').replace(/\\/g, '/'));
        if (!safeFilename) throw new Error('Invalid asset filename');
        LocalAdapter.assertSafeSegment(projectId, 'projectId');
        LocalAdapter.assertSafeSegment(variantKey, 'variantKey');
        const filePath = LocalAdapter.safeAssetFilePath(projectId, variantKey, safeFilename);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, buffer);
        const storedPath = `${projectId}/${variantKey}/${safeFilename}`;
        const url = this.assetUrl(projectId, variantKey, safeFilename, true);
        return { path: storedPath, url, size: buffer.length };
    }

    async download(storedPath: string): Promise<Buffer> {
        const { projectId, variantKey, filename } = LocalAdapter.parseStoredPath(storedPath);
        const filePath = LocalAdapter.safeAssetFilePath(projectId, variantKey, filename);
        return fs.promises.readFile(filePath);
    }

    async delete(storedPath: string): Promise<void> {
        const { projectId, variantKey, filename } = LocalAdapter.parseStoredPath(storedPath);
        const filePath = LocalAdapter.safeAssetFilePath(projectId, variantKey, filename);
        try {
            await fs.promises.unlink(filePath);
        } catch (err: any) {
            if (err?.code !== 'ENOENT') throw err;
        }
    }

    async getUrl(storedPath: string): Promise<string> {
        const { projectId, variantKey, filename } = LocalAdapter.parseStoredPath(storedPath);
        return this.assetUrl(projectId, variantKey, filename, true);
    }
}
