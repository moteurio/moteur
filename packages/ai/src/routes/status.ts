import { Router, Request, Response } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import { getAdapter } from '../adapter.js';
import { isAiCreditsDisabled } from '../credits.js';
import type { PluginRouteContext } from '@moteurio/types/Plugin.js';

export function createStatusRouter(ctx: PluginRouteContext): Router {
    const router = Router();
    router.get('/status', ctx.requireAuth, async (_req: Request, res: Response) => {
        const adapter = await getAdapter();
        const raw = (process.env.MOTEUR_AI_PROVIDER ?? '').trim();
        const textProvider = raw.length > 0 ? raw : null;
        res.json({
            enabled: !!adapter,
            textProvider,
            creditsGloballyDisabled: isAiCreditsDisabled()
        });
    });
    return router;
}

export const statusOpenapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/status': {
        get: {
            summary: 'Check if AI is enabled',
            tags: ['AI'],
            description:
                'Returns whether an AI provider is configured. Studio uses this to show or hide AI features.',
            responses: {
                '200': {
                    description: 'AI status',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    enabled: { type: 'boolean' },
                                    textProvider: { type: 'string', nullable: true },
                                    creditsGloballyDisabled: { type: 'boolean' }
                                },
                                required: ['enabled', 'textProvider', 'creditsGloballyDisabled']
                            }
                        }
                    }
                }
            }
        }
    }
};
