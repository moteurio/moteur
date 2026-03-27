import { Router, Request, Response } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import { getAdapter } from '../adapter.js';
import { getCredits, isAiCreditsDisabled } from '../credits.js';
import type { PluginRouteContext } from '@moteurio/types/Plugin.js';

/** Per-project AI context for Studio settings: global text adapter + credit balance. */
export function createSettingsOverviewRouter(ctx: PluginRouteContext): Router {
    const router = Router();
    router.get(
        '/settings/:projectId',
        ctx.requireAuth,
        ctx.requireProjectAccess,
        async (req: Request, res: Response) => {
            const { projectId } = req.params;
            const adapter = await getAdapter();
            const raw = (process.env.MOTEUR_AI_PROVIDER ?? '').trim();
            const textProvider = raw.length > 0 ? raw : null;
            const unlimited = isAiCreditsDisabled();
            const remaining = getCredits(projectId);
            res.json({
                textAi: {
                    enabled: !!adapter,
                    provider: textProvider
                },
                credits: {
                    remaining,
                    unlimited
                }
            });
        }
    );
    return router;
}

export const settingsOverviewOpenapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/settings/{projectId}': {
        get: {
            summary: 'AI overview for a project (text provider, credits)',
            tags: ['AI'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Global text AI flags and this project’s credit balance',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    textAi: {
                                        type: 'object',
                                        properties: {
                                            enabled: { type: 'boolean' },
                                            provider: { type: 'string', nullable: true }
                                        },
                                        required: ['enabled', 'provider']
                                    },
                                    credits: {
                                        type: 'object',
                                        properties: {
                                            remaining: { type: 'number' },
                                            unlimited: { type: 'boolean' }
                                        },
                                        required: ['remaining', 'unlimited']
                                    }
                                },
                                required: ['textAi', 'credits']
                            }
                        }
                    }
                }
            }
        }
    }
};
