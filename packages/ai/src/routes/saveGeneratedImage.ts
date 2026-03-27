/**
 * POST /ai/save-generated-image — Fetch image from provider URL, upload to project storage, create asset.
 */
import { Router } from 'express';
import axios from 'axios';
import { z } from 'zod';
import { getProject } from '@moteurio/core/projects.js';
import { uploadAsset } from '@moteurio/core/assets/assetService.js';
import type { PluginRouteContext } from '@moteurio/types/Plugin.js';

const bodySchema = z.object({
    variantUrl: z.string().url(),
    prompt: z.string(),
    provider: z.string(),
    aspectRatio: z.string(),
    projectId: z.string().min(1),
    entryId: z.string().optional(),
    fieldPath: z.string().optional()
});

export function createSaveGeneratedImageRouter(ctx: PluginRouteContext): Router {
    const router = Router();
    router.post('/save-generated-image', ctx.requireAuth, async (req: any, res: any) => {
        const parse = bodySchema.safeParse(req.body ?? {});
        if (!parse.success) {
            return res
                .status(400)
                .json({ error: 'Invalid request', details: parse.error.flatten() });
        }
        const {
            variantUrl,
            prompt,
            provider,
            aspectRatio: _aspectRatio,
            projectId,
            entryId,
            fieldPath
        } = parse.data;

        try {
            const project = await getProject(req.user, projectId);
            if (project.users?.length && !project.users.includes(req.user.id)) {
                return res.status(403).json({ error: 'Access to this project is forbidden' });
            }
            if (project.ai?.enabled === false) {
                return res.status(403).json({ error: 'AI is disabled for this project' });
            }
            const response = await axios.get(variantUrl, {
                responseType: 'arraybuffer',
                timeout: 30000,
                maxContentLength: 20 * 1024 * 1024,
                validateStatus: (s: number) => s === 200
            });
            const buffer = Buffer.from(response.data);
            const contentType = (response.headers['content-type'] as string) || 'image/png';
            const mimeType = contentType.split(';')[0].trim().toLowerCase();
            if (!mimeType.startsWith('image/')) {
                return res.status(400).json({ error: 'URL did not return an image' });
            }
            const ext =
                mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
            const filename = `generated-${Date.now()}.${ext}`;

            const asset = await uploadAsset(
                projectId,
                req.user,
                { buffer, originalName: filename, mimeType },
                {
                    generationPrompt: prompt,
                    aiProvider: provider,
                    aiGenerated: true
                }
            );

            return res.json({
                asset: {
                    ...asset,
                    url: asset.localUrl ?? asset.url
                },
                ...(entryId && fieldPath && { entryId, fieldPath })
            });
        } catch (err: any) {
            if (err?.response?.status && err.response.status !== 200) {
                return res.status(502).json({ error: 'Failed to fetch image from provider' });
            }
            if (err?.code === 'ECONNABORTED' || err?.code === 'ENOTFOUND') {
                return res.status(502).json({ error: 'Failed to fetch image from provider' });
            }
            console.error('Save generated image failed:', err);
            return res.status(500).json({ error: err?.message ?? 'Failed to save image' });
        }
    });
    return router;
}
