import fs from 'fs';
import path from 'path';
import type { Express, Request, Response } from 'express';
import { storageConfig } from '@moteurio/core';
import {
    getResizedImage,
    parseResizeRequest,
    resizeContentType,
    ResizeNotFound
} from '@moteurio/core/assets/resize.js';

/** Played or shown in place by browsers; every other file is sent to be saved, never rendered here. */
const INLINE = new Set([
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.webp',
    '.avif',
    '.mp4',
    '.m4v',
    '.mov',
    '.webm',
    '.mp3',
    '.m4a',
    '.aac',
    '.wav',
    '.ogg',
    '.oga',
    '.weba',
    '.flac',
    '.pdf',
    '.glb',
    '.gltf',
    '.usdz'
]);

function assertSafeSegment(value: string, _label: string): boolean {
    if (!value || value.includes('/') || value.includes('\\') || value === '.' || value === '..') {
        return false;
    }
    return true;
}

/**
 * Local disk asset URLs — must stay in sync with LocalAdapter URL generation.
 */
export function mountStaticAssets(app: Express, basePath: string): void {
    const prefix = `${basePath}/static/assets/:projectId/:variantKey/:filename`;
    app.get(prefix, (req: Request, res: Response): void => {
        const { projectId, variantKey, filename } = req.params as Record<string, string>;
        if (
            !assertSafeSegment(projectId, 'projectId') ||
            !assertSafeSegment(variantKey, 'variantKey') ||
            !assertSafeSegment(filename, 'filename')
        ) {
            res.status(400).end();
            return;
        }

        const projectsDir = path.resolve(storageConfig.projectsDir);
        const projectRoot = path.resolve(projectsDir, projectId);
        const relProject = path.relative(projectsDir, projectRoot);
        if (relProject.startsWith('..') || path.isAbsolute(relProject)) {
            res.status(400).end();
            return;
        }

        const filePath = path.resolve(projectRoot, 'assets', variantKey, filename);
        const relFile = path.relative(projectRoot, filePath);
        if (relFile.startsWith('..') || path.isAbsolute(relFile)) {
            res.status(400).end();
            return;
        }

        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
            res.status(404).end();
            return;
        }
        // Media is meant to be embedded by sites and the Studio on other origins; the global
        // security headers (Helmet) would otherwise mark it same-origin only.
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        // Files come from people: the browser takes the type we send, and nothing they hold runs
        // on the API's origin. Anything but media is a download.
        res.setHeader('X-Content-Type-Options', 'nosniff');
        if (!INLINE.has(path.extname(filename).toLowerCase())) {
            res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
            res.attachment(filename);
        }
        // Originals never change, and rebuilt copies get a new `?v=`: both can be kept for good.
        // A copy asked for without its version (an old link) may still change: keep it an hour.
        const immutable = variantKey === 'original' || typeof req.query.v === 'string';
        res.setHeader(
            'Cache-Control',
            immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=3600'
        );
        // The path is validated above; the data root itself may sit under a dot-directory
        // (e.g. ~/.moteur), which send() would otherwise refuse with a 404.
        res.sendFile(filePath, { dotfiles: 'allow' });
    });
}

/**
 * Images at any size, whatever the project's storage (`asset.resizeUrl` + `&w=640`, optionally
 * `&ar=1:1` and `&fmt=avif`). Each size is made once and kept with the asset's other files.
 */
export function mountResizedImages(app: Express, basePath: string): void {
    app.get(
        `${basePath}/static/resize/:projectId/:assetId`,
        async (req: Request, res: Response): Promise<void> => {
            const { projectId, assetId } = req.params as Record<string, string>;
            if (
                !assertSafeSegment(projectId, 'projectId') ||
                !assertSafeSegment(assetId, 'assetId')
            ) {
                res.status(400).end();
                return;
            }
            let request;
            try {
                request = parseResizeRequest(req.query as Record<string, unknown>);
            } catch (err) {
                res.status(400).json({ error: (err as Error).message });
                return;
            }
            try {
                const { buffer, format } = await getResizedImage(projectId, assetId, request);
                res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
                res.setHeader('Content-Type', resizeContentType(format));
                // `v` changes when the crops do; without it, an answer may change: an hour.
                res.setHeader(
                    'Cache-Control',
                    typeof req.query.v === 'string'
                        ? 'public, max-age=31536000, immutable'
                        : 'public, max-age=3600'
                );
                res.end(buffer);
            } catch (err) {
                if (err instanceof ResizeNotFound) {
                    res.status(404).end();
                    return;
                }
                console.error('[moteur] resize failed', projectId, assetId, err);
                res.status(500).json({ error: 'The image could not be resized.' });
            }
        }
    );
}
