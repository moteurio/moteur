import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import {
    getProjectAiAuditLog,
    getAiAuditEventById,
    toAiAuditSummary
} from '@moteurio/core/aiAuditLogger.js';
import { OPERATOR_ROLE_SLUG } from '@moteurio/types';
import { requireProjectAccess } from '../../middlewares/auth.js';
import { sendApiError } from '../../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

/** Project members: summary only (no prompts/responses). */
router.get('/', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params;
    const limit = req.query.limit != null ? Number(req.query.limit) : 50;
    const before = typeof req.query.before === 'string' ? req.query.before : undefined;
    try {
        const page = await getProjectAiAuditLog(projectId, limit, before);
        return void res.json(page);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

/**
 * One audit row. Operators see full prompt/response; other project members see summary only.
 */
router.get('/:eventId', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, eventId } = req.params;
    try {
        const event = await getAiAuditEventById(projectId, eventId);
        if (!event) {
            return void res.status(404).json({ error: 'Audit event not found' });
        }
        const isOperator = req.user?.roles?.includes(OPERATOR_ROLE_SLUG) === true;
        if (isOperator) {
            return void res.json(event);
        }
        return void res.json(toAiAuditSummary(event));
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/ai-audit': {
        get: {
            summary: 'List AI audit events (summary — no prompts)',
            tags: ['AI'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
                {
                    name: 'before',
                    in: 'query',
                    description: 'ISO timestamp; fetch older events',
                    schema: { type: 'string', format: 'date-time' }
                }
            ],
            responses: {
                '200': {
                    description: 'Newest first; summaries only',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    events: { type: 'array', items: { type: 'object' } },
                                    nextBefore: { type: 'string', format: 'date-time' }
                                }
                            }
                        }
                    }
                }
            }
        }
    },
    '/projects/{projectId}/ai-audit/{eventId}': {
        get: {
            summary: 'Get one AI audit event (full prompts if platform admin)',
            tags: ['AI'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'eventId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Full or summary row',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/JsonRecord' }
                        }
                    }
                },
                '404': {
                    description: 'Not found',
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
