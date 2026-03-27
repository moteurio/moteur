/**
 * POST /ai/generate-image — Generate images from text prompt.
 */
import { Router } from 'express';
import { z } from 'zod';
import { getProject } from '@moteurio/core/projects.js';
import { generateImages, getCredits } from '../index.js';
import { AIError } from '../errors.js';
import type { PluginRouteContext } from '@moteurio/types/Plugin.js';
import type { OpenAPIV3 } from 'openapi-types';

const bodySchema = z.object({
    prompt: z.string().min(1),
    styleHints: z
        .array(
            z.enum(['photographic', 'illustration', 'technical-diagram', 'editorial', 'abstract'])
        )
        .optional(),
    aspectRatio: z.enum(['1:1', '4:3', '16:9', '3:2']).optional(),
    count: z.number().int().min(1).max(2).optional(),
    projectId: z.string().min(1),
    entryId: z.string().optional(),
    source: z.enum(['field', 'brief', 'library']).optional()
});

export function createGenerateImageRouter(ctx: PluginRouteContext): Router {
    const router = Router();
    router.post('/generate-image', ctx.requireAuth, async (req: any, res: any) => {
        const parse = bodySchema.safeParse(req.body ?? {});
        if (!parse.success) {
            return res
                .status(400)
                .json({ error: 'Invalid request', details: parse.error.flatten() });
        }
        const {
            prompt,
            styleHints,
            aspectRatio,
            count,
            projectId,
            entryId: _entryId,
            source: _source
        } = parse.data;

        try {
            const project = await getProject(req.user, projectId);
            if (project.users?.length && !project.users.includes(req.user.id)) {
                return res.status(403).json({ error: 'Access to this project is forbidden' });
            }
            if (project.ai?.enabled === false) {
                return res.status(403).json({ error: 'AI is disabled for this project' });
            }
            const projectSettings = { imageProvider: project.ai?.imageProvider ?? null };
            const credits = getCredits(projectId);
            const context = {
                projectId,
                projectName: project.label,
                projectLocales: project.supportedLocales ?? [project.defaultLocale],
                defaultLocale: project.defaultLocale,
                credits: { remaining: credits }
            };

            const result = await generateImages(
                { prompt, styleHints, aspectRatio, count },
                context,
                projectSettings
            );

            return res.json({
                variants: result.variants.map(v => ({
                    url: v.url,
                    width: v.width,
                    height: v.height
                })),
                prompt: result.prompt,
                creditsUsed: result.creditsUsed,
                creditsRemaining: result.creditsRemaining
            });
        } catch (err: any) {
            const code = err?.code ?? (err instanceof AIError ? err.code : undefined);
            if (code === 'insufficient_credits') {
                return res.status(402).json({
                    error: 'insufficient_credits',
                    creditsRemaining: err?.details?.remaining ?? getCredits(projectId)
                });
            }
            if (code === 'image_provider_not_configured') {
                return res.status(422).json({ error: 'image_provider_not_configured' });
            }
            if (err?.name === 'NotImplementedError') {
                return res.status(503).json({
                    error: 'Image generation is not implemented for the selected provider.'
                });
            }
            console.error('AI generate-image failed:', err);
            return res.status(500).json({ error: err?.message ?? 'Image generation failed' });
        }
    });
    return router;
}

export const generateImageOpenapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/generate-image': {
        post: {
            summary: 'Generate images from a text prompt',
            tags: ['AI'],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            required: ['prompt', 'projectId'],
                            properties: {
                                prompt: { type: 'string' },
                                styleHints: {
                                    type: 'array',
                                    items: {
                                        type: 'string',
                                        enum: [
                                            'photographic',
                                            'illustration',
                                            'technical-diagram',
                                            'editorial',
                                            'abstract'
                                        ]
                                    }
                                },
                                aspectRatio: {
                                    type: 'string',
                                    enum: ['1:1', '4:3', '16:9', '3:2']
                                },
                                count: { type: 'integer', minimum: 1, maximum: 2 },
                                projectId: { type: 'string' },
                                entryId: { type: 'string' },
                                source: {
                                    type: 'string',
                                    enum: ['field', 'brief', 'library']
                                }
                            }
                        }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Image variants',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/AiGenerateImageSuccess' }
                        }
                    }
                },
                '400': {
                    description: 'Invalid body',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                },
                '402': {
                    description: 'Insufficient credits',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    error: { type: 'string' },
                                    creditsRemaining: { type: 'number' }
                                }
                            }
                        }
                    }
                },
                '403': {
                    description: 'Forbidden',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                },
                '422': {
                    description: 'Image provider not configured',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                },
                '500': {
                    description: 'Generation failed',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                },
                '503': {
                    description: 'Not implemented for provider',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                }
            }
        }
    }
};
