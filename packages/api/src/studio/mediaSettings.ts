import type { Request, Response } from 'express';
import { Router } from 'express';
import { requireProjectAccess } from '../middlewares/auth.js';
import { updateProjectMediaSettings } from '@moteurio/core/assets/mediaSettings.js';
import type { OpenAPIV3 } from 'openapi-types';
import { sendApiError } from '../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

router.patch('/', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        const result = await updateProjectMediaSettings(projectId, req.user!, req.body ?? {});
        return void res.json(result);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/media-settings': {
        patch: {
            summary: 'Update media settings (asset config + video providers)',
            tags: ['Media settings'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                assetConfig: { type: 'object' },
                                videoProviders: { type: 'object', nullable: true }
                            }
                        }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Updated assetConfig (redacted) and videoProviders',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/JsonRecord' }
                        }
                    }
                },
                '400': {
                    description: 'Validation error',
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

export default router;
