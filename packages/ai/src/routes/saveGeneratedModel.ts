/**
 * POST /ai/save-generated-model — Keep a generated 3D model: the server fetches the file (and its
 * preview picture) from the provider and adds them to the project's media. Providers' links
 * expire, so a model someone keeps is stored like any upload.
 */
import { Router } from 'express';
import axios from 'axios';
import { z } from 'zod';
import type { OpenAPIV3 } from 'openapi-types';
import type { Asset } from '@moteurio/types/Asset.js';
import { getProject } from '@moteurio/core/projects.js';
import { uploadAsset } from '@moteurio/core/assets/assetService.js';
import { assertPublicHttpsUrl } from '@moteurio/core/webhooks/webhookService.js';
import type { PluginRouteContext } from '@moteurio/types/Plugin.js';
import { helperState } from '../helpers.js';

const MODEL_MIME = { glb: 'model/gltf-binary', usdz: 'model/vnd.usdz+zip' } as const;
const MAX_MODEL_BYTES = 80 * 1024 * 1024;
const MAX_PICTURE_BYTES = 10 * 1024 * 1024;

const bodySchema = z.object({
    projectId: z.string().min(1),
    url: z.string().min(1),
    format: z.enum(['glb', 'usdz']).default('glb'),
    thumbnailUrl: z.string().min(1).optional(),
    prompt: z.string().default(''),
    provider: z.string().optional(),
    title: z.string().optional(),
    entryId: z.string().optional(),
    fieldPath: z.string().optional()
});

/** A provider's file, fetched once, without following redirects (they could lead anywhere). */
async function fetchFile(url: string, maxBytes: number, what: string): Promise<Buffer> {
    await assertPublicHttpsUrl(url, what);
    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 120_000,
        maxRedirects: 0,
        maxContentLength: maxBytes,
        validateStatus: (s: number) => s === 200
    });
    return Buffer.from(response.data);
}

const publicUrl = (a: Asset) => ({ ...a, url: a.localUrl ?? a.url });

export function createSaveGeneratedModelRouter(ctx: PluginRouteContext): Router {
    const router = Router();
    router.post('/save-generated-model', ctx.requireAuth, async (req: any, res: any) => {
        const parse = bodySchema.safeParse(req.body ?? {});
        if (!parse.success)
            return res
                .status(400)
                .json({ error: 'Invalid request', details: parse.error.flatten() });
        const { projectId, url, format, thumbnailUrl, prompt, provider, title } = parse.data;
        try {
            const project = await getProject(req.user, projectId);
            const helper = helperState(project, req.user!, 'model3d');
            if (helper !== 'ok')
                return res.status(403).json({
                    error:
                        helper === 'off'
                            ? 'This helper is off for this project.'
                            : "Your role can't ask for this helper in this project.",
                    code: helper === 'off' ? 'AI_HELPER_OFF' : 'AI_HELPER_ROLE'
                });

            let file: Buffer;
            try {
                file = await fetchFile(url, MAX_MODEL_BYTES, 'Model URL');
            } catch (err) {
                return res.status(502).json({
                    error: `The model could not be fetched: ${err instanceof Error ? err.message : String(err)}`,
                    code: 'FETCH_FAILED'
                });
            }
            const stamp = Date.now();
            const generated = { generationPrompt: prompt, aiProvider: provider, aiGenerated: true };
            const model = await uploadAsset(
                projectId,
                req.user,
                {
                    buffer: file,
                    originalName: `generated-${stamp}.${format}`,
                    mimeType: MODEL_MIME[format]
                },
                { ...generated, ...(title ? { title } : {}) }
            );

            // The preview picture is a bonus: the model is kept even if it can't be fetched.
            let poster: Asset | undefined;
            if (thumbnailUrl) {
                try {
                    const picture = await fetchFile(thumbnailUrl, MAX_PICTURE_BYTES, 'Preview URL');
                    poster = await uploadAsset(
                        projectId,
                        req.user,
                        {
                            buffer: picture,
                            originalName: `generated-${stamp}-preview.png`,
                            mimeType: 'image/png'
                        },
                        generated
                    );
                } catch {
                    poster = undefined;
                }
            }
            return res.json({
                asset: publicUrl(model),
                ...(poster ? { poster: publicUrl(poster) } : {})
            });
        } catch (err: any) {
            const message = err?.message ?? 'Failed to save the model';
            if (/exceeds max upload size|not allowed|disabled|storage/i.test(message))
                return res.status(400).json({ error: message });
            console.error('Save generated model failed:', err);
            return res.status(500).json({ error: message });
        }
    });
    return router;
}

const assetRef: OpenAPIV3.SchemaObject = {
    type: 'object',
    description: 'The new asset, with its public URL.',
    additionalProperties: true,
    properties: { id: { type: 'string' }, url: { type: 'string' }, type: { type: 'string' } }
};

export const saveGeneratedModelOpenapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/save-generated-model': {
        post: {
            summary: 'Keep a generated 3D model in the media library',
            description:
                'Fetches the model (and its preview picture, if given) from the provider over HTTPS and stores them as assets. Needs the 3D helper.',
            tags: ['AI'],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            required: ['projectId', 'url'],
                            properties: {
                                projectId: { type: 'string' },
                                url: {
                                    type: 'string',
                                    description: 'The provider’s HTTPS link to the model'
                                },
                                format: { type: 'string', enum: ['glb', 'usdz'] },
                                thumbnailUrl: { type: 'string' },
                                prompt: { type: 'string' },
                                provider: { type: 'string' },
                                title: { type: 'string' },
                                entryId: { type: 'string' },
                                fieldPath: { type: 'string' }
                            }
                        }
                    }
                }
            },
            responses: {
                '200': {
                    description: '`{ asset, poster? }`',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['asset'],
                                properties: { asset: assetRef, poster: assetRef }
                            }
                        }
                    }
                },
                '400': { description: 'Invalid request, or the file isn’t allowed' },
                '403': { description: 'The 3D helper is off, or not for this role' },
                '502': { description: 'The provider’s file could not be fetched' }
            }
        }
    }
};
