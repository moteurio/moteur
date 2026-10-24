import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import {
    getProjectAiAuditLog,
    getAiAuditEventById,
    toAiAuditSummary
} from '@moteurio/core/aiAuditLogger.js';
import { hasRole } from '@moteurio/types';
import { requireProjectAccess } from '../../middlewares/auth.js';
import { sendApiError } from '../../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

/** Project members: summary only (no prompts/responses). */
router.get('/', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    const asked = Math.floor(Number(req.query.limit));
    const limit = asked > 0 ? Math.min(asked, 200) : 50;
    const before = typeof req.query.before === 'string' ? req.query.before : undefined;
    try {
        const page = await getProjectAiAuditLog(projectId, limit, before);
        return void res.json(page);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

/**
 * One audit row. The project's admins see the full prompt and response; other members a summary.
 */
router.get('/:eventId', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, eventId } = req.params as Record<string, string>;
    try {
        const event = await getAiAuditEventById(projectId, eventId);
        if (!event) {
            return void res.status(404).json({ error: 'Audit event not found' });
        }
        if (hasRole(req.user, 'admin')) {
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
            description:
                'Written by the AI plugin (Moteur Cloud) for each AI call; an empty list on a server without it.',
            tags: ['AI'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                {
                    name: 'limit',
                    in: 'query',
                    schema: { type: 'integer', default: 50, maximum: 200 }
                },
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
