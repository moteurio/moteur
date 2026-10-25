import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import { createPreviewToken } from '@moteurio/core/previewTokens.js';
import { requireProjectAccess } from '../../middlewares/auth.js';
import { sendApiError } from '../../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

router.post('/', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        const body = req.body ?? {};
        const { ttlSeconds, entryId, pageId, collectionId } = body as {
            ttlSeconds?: number;
            entryId?: string;
            pageId?: string;
            collectionId?: string;
        };
        const { rawToken, token } = await createPreviewToken(projectId, req.user!, {
            ...(ttlSeconds !== undefined ? { ttlSeconds } : {}),
            ...(entryId ? { entryId } : {}),
            ...(pageId ? { pageId } : {}),
            ...(collectionId ? { collectionId } : {})
        });
        return void res.status(201).json({
            ...token,
            rawToken,
            message: 'Share this token only with trusted preview URLs. It expires automatically.'
        });
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/preview-tokens': {
        post: {
            tags: ['Preview'],
            summary: 'Create a short-lived preview token for public collection reads',
            security: [{ bearerAuth: [] }],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                ttlSeconds: { type: 'integer', minimum: 60, maximum: 3600 },
                                entryId: { type: 'string' },
                                pageId: { type: 'string' },
                                collectionId: { type: 'string' }
                            }
                        }
                    }
                }
            },
            responses: {
                '201': { description: 'Preview token created' },
                '401': { description: 'Unauthorized' },
                '403': { description: 'Forbidden' }
            }
        }
    }
};

export default router;
