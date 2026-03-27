import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import { publishEntry } from '@moteurio/core/entries.js';
import { requireProjectAccess } from '../middlewares/auth.js';
import { getMessage } from '../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

router.post('/:entryId/publish', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, modelId, entryId } = req.params;
    if (!projectId || !modelId || !entryId) {
        return void res.status(400).json({ error: 'Missing path parameters' });
    }
    try {
        const entry = await publishEntry(req.user!, projectId, modelId, entryId);
        return void res.json(entry);
    } catch (err: unknown) {
        const statusCode = getMessage(err)?.includes('requires an approved review')
            ? 403
            : getMessage(err)?.includes('not found')
              ? 404
              : 400;
        return void res.status(statusCode).json({
            error: getMessage(err) ?? 'Failed to publish entry'
        });
    }
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/models/{modelId}/entries/{entryId}/publish': {
        post: {
            summary: 'Publish an entry (snapshot current revision as live)',
            tags: ['Entries'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'modelId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'entryId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Entry published',
                    content: {
                        'application/json': { schema: { $ref: '#/components/schemas/Entry' } }
                    }
                },
                '403': {
                    description: 'Requires approved review when workflow is enabled',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                },
                '404': {
                    description: 'Entry not found',
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
