import type { Request, Response } from 'express';
import { Router } from 'express';
import { getGlobalLog } from '@moteurio/core/activityLogger.js';
import type { OpenAPIV3 } from 'openapi-types';
import { requireOperator } from '../middlewares/auth.js';
import { sendApiError } from '../utils/apiError.js';

const router: Router = Router();

router.get('/', requireOperator, async (req: Request, res: Response) => {
    const limit = req.query.limit != null ? Math.min(Number(req.query.limit), 200) : 50;
    const before = typeof req.query.before === 'string' ? req.query.before : undefined;
    try {
        const page = await getGlobalLog(limit, before);
        return void res.json(page);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/activity': {
        get: {
            summary: 'Get recent global (system) activity',
            description: 'User and blueprint changes. Operators only.',
            tags: ['Activity'],
            parameters: [
                { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
                {
                    name: 'before',
                    in: 'query',
                    description: 'ISO timestamp; return events older than this (for pagination)',
                    schema: { type: 'string', format: 'date-time' }
                }
            ],
            responses: {
                '200': {
                    description: 'List of activity events (newest first)',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    events: {
                                        type: 'array',
                                        items: { $ref: '#/components/schemas/ActivityEvent' }
                                    },
                                    nextBefore: {
                                        type: 'string',
                                        format: 'date-time',
                                        description: 'Use as `before` for the next page'
                                    }
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
