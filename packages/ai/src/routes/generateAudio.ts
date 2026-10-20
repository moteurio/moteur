/**
 * POST /ai/generate-audio — Generate speech from a text prompt.
 */
import { Router } from 'express';
import { z } from 'zod';
import { getProject } from '@moteurio/core/projects.js';
import { generateAudio, getCredits } from '../index.js';
import { AIError } from '../errors.js';
import type { PluginRouteContext } from '@moteurio/types/Plugin.js';
import type { OpenAPIV3 } from 'openapi-types';
import { helperState } from '../helpers.js';

const bodySchema = z.object({
    prompt: z.string().min(1),
    voice: z.string().optional(),
    projectId: z.string().min(1),
    entryId: z.string().optional(),
    fieldPath: z.string().optional()
});

export function createGenerateAudioRouter(ctx: PluginRouteContext): Router {
    const router = Router();
    router.post('/generate-audio', ctx.requireAuth, async (req: any, res: any) => {
        const parse = bodySchema.safeParse(req.body ?? {});
        if (!parse.success) {
            return res
                .status(400)
                .json({ error: 'Invalid request', details: parse.error.flatten() });
        }
        const { prompt, voice, projectId } = parse.data;

        try {
            const project = await getProject(req.user, projectId);
            if (project.users?.length && !project.users.includes(req.user.id)) {
                return res.status(403).json({ error: 'Access to this project is forbidden' });
            }
            const helper = helperState(project, req.user!, 'audio');
            if (helper !== 'ok') {
                return res.status(403).json({
                    error:
                        helper === 'off'
                            ? 'This helper is off for this project.'
                            : "Your role can't ask for this helper in this project.",
                    code: helper === 'off' ? 'AI_HELPER_OFF' : 'AI_HELPER_ROLE'
                });
            }
            const projectSettings = { audioProvider: project.ai?.audioProvider ?? null };
            const credits = getCredits(projectId);
            const context = {
                projectId,
                projectName: project.label,
                projectLocales: project.supportedLocales ?? [project.defaultLocale],
                defaultLocale: project.defaultLocale,
                credits: { remaining: credits }
            };

            const result = await generateAudio({ prompt, voice }, context, projectSettings);

            return res.json({
                variants: result.variants.map(v => ({
                    audioBase64: v.audioBase64,
                    mimeType: v.mimeType
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
            if (code === 'audio_provider_not_configured') {
                return res.status(422).json({ error: 'audio_provider_not_configured' });
            }
            if (err?.name === 'NotImplementedError') {
                return res.status(503).json({
                    error: 'Audio generation is not implemented for the selected provider.'
                });
            }
            console.error('AI generate-audio failed:', err);
            return res.status(500).json({ error: err?.message ?? 'Audio generation failed' });
        }
    });
    return router;
}

export const generateAudioOpenapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/generate-audio': {
        post: {
            summary: 'Generate speech audio from a text prompt',
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
                                voice: { type: 'string' },
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
                    description: 'Audio variants (base64)',
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
                                                audioBase64: { type: 'string' },
                                                mimeType: { type: 'string' }
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
                '422': { description: 'Audio provider not configured' },
                '500': { description: 'Generation failed' },
                '503': { description: 'Not implemented for provider' }
            }
        }
    }
};
