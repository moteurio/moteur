import type { Request, Response } from 'express';
import { Router } from 'express';
import { migrateProvider } from '@moteurio/core/assets/assetService.js';
import { requireAuth } from '../../middlewares/auth.js';
import type { OpenAPIV3 } from 'openapi-types';
import { sendApiError } from '../../utils/apiError.js';

const router: Router = Router();

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/studio/assets/migrate-provider': {
        post: {
            summary: 'Move videos to another host (deprecated)',
            description:
                'Kept for scripts: prefer POST /projects/{projectId}/media-settings/move-videos. `projectIds` is required and the caller must be an admin of each project; `toProvider` must be where that project’s new videos go (Setup › Media). Same move: in the background, from the copy kept on the server, old host emptied once ready when `removeFromOld` is set.',
            deprecated: true,
            tags: ['Studio Assets'],
            requestBody: {
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                fromProvider: { type: 'string' },
                                toProvider: {
                                    type: 'string',
                                    description: 'Target provider (required)'
                                },
                                projectIds: { type: 'array', items: { type: 'string' } },
                                removeFromOld: { type: 'boolean' }
                            },
                            required: ['toProvider', 'projectIds']
                        }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Migration result',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/JsonRecord' }
                        }
                    }
                },
                '400': {
                    description: 'Missing toProvider or projectIds',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                },
                '500': {
                    description: 'Migration failed',
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

router.post('/migrate-provider', requireAuth, async (req: Request, res: Response) => {
    try {
        const body = req.body ?? {};
        const fromProvider = body.fromProvider;
        const toProvider = body.toProvider;
        const projectIds = body.projectIds;
        if (!toProvider) return void res.status(400).json({ error: 'Missing toProvider' });
        const result = await migrateProvider(req.user!, {
            fromProvider,
            toProvider,
            projectIds,
            removeFromOld: body.removeFromOld === true
        });
        return void res.json(result);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

export default router;
