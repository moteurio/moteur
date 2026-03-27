import type { Request, Response } from 'express';
import { Router } from 'express';
import { listEntries } from '@moteurio/core/entries.js';
import { getModelSchema } from '@moteurio/core/models.js';
import { resolveEntryAssets } from '@moteurio/core/assets/assetResolver.js';
import { resolveEntryUrl } from '@moteurio/core/pages.js';
import type { OpenAPIV3 } from 'openapi-types';
import { requireProjectAccess } from '../middlewares/auth.js';
import { listBlocks } from '@moteurio/core/blocks.js';
import { stripEditorialBlocksFromPayload } from '../utils/stripBlockSchema.js';
import { sendApiError } from '../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

router.get('/', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, modelId } = req.params;

    if (!projectId || !modelId) {
        return void res.status(400).json({ error: 'Missing projectId or modelId in path' });
    }

    try {
        let entries = await listEntries(req.user!, projectId, modelId);
        if (req.query.resolveAssets === '1') {
            const schema = await getModelSchema(req.user!, projectId, modelId);
            entries = await Promise.all(entries.map(e => resolveEntryAssets(projectId, e, schema)));
        }
        if (req.query.resolveUrl === '1') {
            entries = await Promise.all(
                entries.map(async e => {
                    const url = await resolveEntryUrl(projectId, e.id, modelId);
                    return { ...e, ...(url != null && { resolvedUrl: url }) };
                })
            );
        }
        const filtered = stripEditorialBlocksFromPayload(entries, listBlocks(projectId));
        return void res.json({ entries: filtered });
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/models/{modelId}/entries': {
        get: {
            summary: 'List entries for a model',
            tags: ['Entries'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'modelId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'List of entries',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/EntriesListResponse' }
                        }
                    }
                },
                '400': {
                    description: 'Missing parameters',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    error: { type: 'string' }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
};

export default router;
