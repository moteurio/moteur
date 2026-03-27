import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import { updateEntry } from '@moteurio/core/entries.js';
import type { EntryStatus } from '@moteurio/types/Model.js';
import { requireProjectAccess } from '../middlewares/auth.js';
import { getMessage } from '../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

const VALID_STATUSES: EntryStatus[] = ['draft', 'in_review', 'published', 'unpublished'];

router.patch('/:entryId/status', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, modelId, entryId } = req.params;
    if (!projectId || !modelId || !entryId) {
        return void res.status(400).json({ error: 'Missing path parameters' });
    }
    const status = req.body?.status as string | undefined;
    if (!status || !VALID_STATUSES.includes(status as EntryStatus)) {
        return void res.status(400).json({
            error: `status must be one of: ${VALID_STATUSES.join(', ')}`
        });
    }
    try {
        const entry = await updateEntry(req.user!, projectId, modelId, entryId, {
            status: status as EntryStatus
        });
        return void res.json(entry);
    } catch (err: unknown) {
        const statusCode = getMessage(err)?.includes('requires an approved review')
            ? 403
            : getMessage(err)?.includes('not found')
              ? 404
              : 400;
        return void res.status(statusCode).json({
            error: getMessage(err) ?? 'Failed to update entry status'
        });
    }
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/models/{modelId}/entries/{entryId}/status': {
        patch: {
            summary:
                'Update entry status (operators can bypass review; others require approval for published)',
            tags: ['Entries'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'modelId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'entryId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            required: ['status'],
                            properties: {
                                status: { type: 'string', enum: VALID_STATUSES }
                            }
                        }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Entry updated',
                    content: {
                        'application/json': { schema: { $ref: '#/components/schemas/Entry' } }
                    }
                },
                '403': {
                    description:
                        'Publishing requires approved review when workflow.requireReview is enabled',
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
