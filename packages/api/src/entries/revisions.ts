import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import { getEntryRevisions } from '@moteurio/core/entries.js';
import { requireProjectAccess } from '../middlewares/auth.js';
import { sendApiError } from '../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

router.get('/:entryId/revisions', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, modelId, entryId } = req.params;
    if (!projectId || !modelId || !entryId) {
        return void res.status(400).json({ error: 'Missing path parameters' });
    }
    try {
        const rawMax = req.query.max;
        const maxStr =
            typeof rawMax === 'string'
                ? rawMax
                : Array.isArray(rawMax) && typeof rawMax[0] === 'string'
                  ? rawMax[0]
                  : '20';
        const max = Math.min(parseInt(maxStr, 10) || 20, 100);
        const revisions = getEntryRevisions(projectId, modelId, entryId, max);
        return void res.json(revisions);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/models/{modelId}/entries/{entryId}/revisions': {
        get: {
            summary: 'Get revision history for an entry (from git)',
            tags: ['Entries'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'modelId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'entryId', in: 'path', required: true, schema: { type: 'string' } },
                {
                    name: 'max',
                    in: 'query',
                    required: false,
                    schema: { type: 'integer', default: 20, maximum: 100 }
                }
            ],
            responses: {
                '200': {
                    description: 'Revision history (newest first)',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'array',
                                items: { $ref: '#/components/schemas/EntryRevision' }
                            }
                        }
                    }
                }
            }
        }
    }
};

export default router;
