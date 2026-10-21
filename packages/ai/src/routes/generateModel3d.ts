/**
 * POST /ai/generate-3d — Generate a 3D model from a text prompt.
 */
import { Router } from 'express';
import { z } from 'zod';
import { getProject } from '@moteurio/core/projects.js';
import { generateModels3d, getCredits } from '../index.js';
import { AIError } from '../errors.js';
import type { PluginRouteContext } from '@moteurio/types/Plugin.js';
import type { OpenAPIV3 } from 'openapi-types';
import { helperState } from '../helpers.js';

const bodySchema = z.object({
    prompt: z.string().min(1).max(800),
    textured: z.boolean().optional(),
    format: z.enum(['glb', 'fbx', 'obj', 'usdz']).optional(),
    projectId: z.string().min(1),
    entryId: z.string().optional(),
    fieldPath: z.string().optional()
});

export function createGenerateModel3dRouter(ctx: PluginRouteContext): Router {
    const router = Router();
    router.post('/generate-3d', ctx.requireAuth, async (req: any, res: any) => {
        const parse = bodySchema.safeParse(req.body ?? {});
        if (!parse.success) {
            return res
                .status(400)
                .json({ error: 'Invalid request', details: parse.error.flatten() });
        }
        const { prompt, textured, format, projectId } = parse.data;

        try {
            const project = await getProject(req.user, projectId);
            if (project.users?.length && !project.users.includes(req.user.id)) {
                return res.status(403).json({ error: 'Access to this project is forbidden' });
            }
            const helper = helperState(project, req.user!, 'model3d');
            if (helper !== 'ok') {
                return res.status(403).json({
                    error:
                        helper === 'off'
                            ? 'This helper is off for this project.'
                            : "Your role can't ask for this helper in this project.",
                    code: helper === 'off' ? 'AI_HELPER_OFF' : 'AI_HELPER_ROLE'
                });
            }
            const projectSettings = { model3dProvider: project.ai?.model3dProvider ?? null };
            const credits = getCredits(projectId);
            const context = {
                projectId,
                projectName: project.label,
                projectLocales: project.supportedLocales ?? [project.defaultLocale],
                defaultLocale: project.defaultLocale,
                credits: { remaining: credits }
            };

            const result = await generateModels3d(
                { prompt, textured, format },
                context,
                projectSettings
            );

            return res.json({
                variants: result.variants.map(v => ({
                    url: v.url,
                    format: v.format,
                    thumbnailUrl: v.thumbnailUrl
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
            if (code === 'model3d_provider_not_configured') {
                return res.status(422).json({ error: 'model3d_provider_not_configured' });
            }
            if (err?.name === 'NotImplementedError') {
                return res.status(503).json({
                    error: '3D generation is not implemented for the selected provider.'
                });
            }
            console.error('AI generate-3d failed:', err);
            return res.status(500).json({ error: err?.message ?? '3D generation failed' });
        }
    });
    return router;
}

export const generateModel3dOpenapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/generate-3d': {
        post: {
            summary: 'Generate a 3D model from a text prompt',
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
                                textured: { type: 'boolean' },
                                format: {
                                    type: 'string',
                                    enum: ['glb', 'fbx', 'obj', 'usdz']
                                },
                                projectId: { type: 'string' },
                                entryId: { type: 'string' },
                                fieldPath: { type: 'string' }
                            }
                        }
                    }
                }
            },
            responses: {
                '200': {
                    description: '3D model download URLs',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['variants'],
                                properties: {
                                    variants: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                url: { type: 'string' },
                                                format: { type: 'string' },
                                                thumbnailUrl: { type: 'string' }
                                            }
                                        }
                                    },
                                    prompt: { type: 'string' },
                                    creditsUsed: { type: 'number' },
                                    creditsRemaining: { type: 'number', nullable: true }
                                }
                            }
                        }
                    }
                },
                '400': { description: 'Invalid body' },
                '402': { description: 'Insufficient credits' },
                '403': { description: 'Forbidden' },
                '422': { description: '3D provider not configured' },
                '500': { description: 'Generation failed' },
                '503': { description: 'Not implemented for provider' }
            }
        }
    }
};
