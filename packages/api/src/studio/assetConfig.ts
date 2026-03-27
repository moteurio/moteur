import type { Request, Response } from 'express';
import { Router } from 'express';
import { getAssetConfig, updateAssetConfig } from '@moteurio/core/assets/assetService.js';
import { requireProjectAccess } from '../middlewares/auth.js';
import type { OpenAPIV3 } from 'openapi-types';
import { sendApiError } from '../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

router.get('/', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        const config = await getAssetConfig(projectId, req.user!);
        return void res.json(config);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.patch('/', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        const config = await updateAssetConfig(projectId, req.user!, req.body);
        return void res.json(config);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/asset-config': {
        get: {
            summary: 'Get asset config',
            tags: ['Studio Asset Config'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Asset config',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/JsonRecord' }
                        }
                    }
                }
            }
        },
        patch: {
            summary: 'Update asset config',
            tags: ['Studio Asset Config'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/JsonRecord' }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Config updated',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/JsonRecord' }
                        }
                    }
                }
            }
        }
    }
};

export default router;
