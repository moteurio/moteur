import type { Request, Response, NextFunction } from 'express';
import { verifyPreviewToken } from '@moteurio/core/previewTokens.js';

function readPreviewToken(req: Request): string {
    const header = (req.headers['x-preview-token'] as string)?.trim() ?? '';
    if (header) return header;
    if (req.method !== 'GET') return '';
    const q = req.query.preview;
    if (typeof q === 'string' && q.trim()) return q.trim();
    if (Array.isArray(q) && typeof q[0] === 'string' && q[0].trim()) return q[0].trim();
    return '';
}

/**
 * When a valid preview token is present, sets `req.previewAuth` and optional scope fields.
 * Invalid token when explicitly sent → 401. Missing token → next().
 */
export function previewTokenAuth(req: Request, res: Response, next: NextFunction): void {
    const raw = readPreviewToken(req);
    if (!raw) {
        next();
        return;
    }
    const projectId = (req.params as Record<string, string>).projectId;
    if (!projectId) {
        res.status(400).json({ error: 'Project ID is required' });
        return;
    }
    verifyPreviewToken(projectId, raw)
        .then(result => {
            if (!result.ok) {
                res.status(401).json({
                    error: 'Invalid or expired preview token',
                    code: 'PREVIEW_TOKEN_INVALID'
                });
                return;
            }
            req.previewAuth = true;
            req.previewTokenId = result.tokenId;
            if (result.channelId) req.previewChannelId = result.channelId;
            if (result.entryId) {
                req.previewModelId = result.modelId;
                req.previewEntryId = result.entryId;
            }
            if (result.pageId) req.previewPageId = result.pageId;
            next();
        })
        .catch(() => {
            res.status(401).json({
                error: 'Invalid or expired preview token',
                code: 'PREVIEW_TOKEN_INVALID'
            });
        });
}
