import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';

import { getEntry } from '@moteurio/core/entries.js';
import { getModelSchema } from '@moteurio/core/models.js';
import { resolveEntryAssets } from '@moteurio/core/assets/assetResolver.js';
import { resolveEntryUrl } from '@moteurio/core/pages.js';
import { requireProjectAccess } from '../middlewares/auth.js';
import { listBlocks } from '@moteurio/core/blocks.js';
import { stripEditorialBlocksFromPayload } from '../utils/stripBlockSchema.js';
import { sendApiError } from '../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

router.get('/:entryId', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, modelId, entryId } = req.params;

    if (!projectId || !modelId || !entryId) {
        return void res.status(400).json({ error: 'Missing path parameters' });
    }

    try {
        let entry = await getEntry(req.user!, projectId, modelId, entryId);
        if (!entry) {
            return void res.status(404).json({ error: 'Entry not found' });
        }
        if (req.query.resolveAssets === '1') {
            const schema = await getModelSchema(req.user!, projectId, modelId);
            entry = await resolveEntryAssets(projectId, entry, schema);
        }
        let resolvedUrl: string | null | undefined;
        if (req.query.resolveUrl === '1') {
            resolvedUrl = await resolveEntryUrl(projectId, entryId, modelId);
        }
        const payload = {
            ...entry,
            ...(resolvedUrl != null && { resolvedUrl: resolvedUrl ?? undefined })
        };
        const filtered = stripEditorialBlocksFromPayload(payload, listBlocks(projectId));
        return void res.json({ entry: filtered });
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/models/{modelId}/entries/{entryId}': {
        get: {
            summary: 'Get a single entry',
            tags: ['Entries'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'modelId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'entryId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Single entry found',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/EntryOneResponse' }
                        }
                    }
                },
                '404': {
                    description: 'Entry not found',
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
