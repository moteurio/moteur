import express, { Router } from 'express';
import { z } from 'zod';
import { getAdapter } from '../../adapter.js';
import type { PluginRouteContext } from '@moteurio/types/Plugin.js';

const schema = z.object({
    prompt: z.string().min(5),
    size: z.enum(['1024x1024', '1792x1024', '1024x1792']).default('1024x1024'),
    quality: z.string().default('hd')
});

const sizeToAspectRatio = {
    '1024x1024': '1:1' as const,
    '1792x1024': '16:9' as const,
    '1024x1792': '3:2' as const
};

export function createImageRouter(ctx: PluginRouteContext): Router {
    const router = express.Router({ mergeParams: true });
    router.post('/', ctx.requireAuth, async (req: any, res: any) => {
        const parseResult = schema.safeParse(req.body ?? {});
        if (!parseResult.success) {
            return res.status(400).json({ error: 'Invalid or missing prompt/params' });
        }

        const { prompt, size, quality } = parseResult.data;

        const adapter = await getAdapter();
        if (!adapter?.generateImage) {
            return res.status(503).json({
                error: 'AI image generation is disabled (no provider with generateImage support configured)'
            });
        }

        try {
            const aspectRatio = sizeToAspectRatio[size as keyof typeof sizeToAspectRatio];
            const results = await adapter.generateImage(
                `Generate an image of ${prompt}. Use size: ${size}. Quality: ${quality}.`,
                { aspectRatio, count: 1 }
            );

            if (!results?.length || !results[0].url) {
                return res.status(500).json({ error: 'Image generation failed' });
            }

            return res.json({
                image: results[0].url,
                width: results[0].width,
                height: results[0].height,
                prompt: results[0].prompt
            });
        } catch (err: any) {
            console.error('AI generate/image failed:', err);
            return res.status(500).json({ error: err.message || 'Image generation failed' });
        }
    });
    return router;
}
