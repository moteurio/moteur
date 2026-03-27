import type { Request, Response } from 'express';
import { Router } from 'express';
import { getProjectLog, getLog } from '@moteurio/core/activityLogger.js';
import type { ActivityResourceType } from '@moteurio/types/Activity.js';
import type { OpenAPIV3 } from 'openapi-types';
import { requireProjectAccess } from '../../middlewares/auth.js';
import { sendApiError } from '../../utils/apiError.js';

const RESOURCE_TYPES: ActivityResourceType[] = [
    'entry',
    'layout',
    'page',
    'structure',
    'model',
    'project',
    'user',
    'blueprint'
];

const router: Router = Router({ mergeParams: true });

router.get('/', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params;
    const limit = req.query.limit != null ? Math.min(Number(req.query.limit), 200) : 50;
    const before = typeof req.query.before === 'string' ? req.query.before : undefined;
    try {
        const page = await getProjectLog(projectId, limit, before);
        return void res.json(page);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.get(
    '/:resourceType/:resourceId',
    requireProjectAccess,
    async (req: Request, res: Response) => {
        const { projectId, resourceType, resourceId } = req.params;
        if (!RESOURCE_TYPES.includes(resourceType as ActivityResourceType)) {
            return void res.status(400).json({
                error: `Invalid resourceType. Must be one of: ${RESOURCE_TYPES.join(', ')}`
            });
        }
        try {
            const events = await getLog(
                projectId,
                resourceType as ActivityResourceType,
                resourceId
            );
            return void res.json({ events });
        } catch (err: unknown) {
            return void sendApiError(res, req, err);
        }
    }
);

export const schemas: OpenAPIV3.ComponentsObject['schemas'] = {
    ActivityEvent: {
        type: 'object',
        properties: {
            id: { type: 'string' },
            projectId: { type: 'string' },
            resourceType: { type: 'string', enum: RESOURCE_TYPES },
            resourceId: { type: 'string' },
            action: {
                type: 'string',
                enum: [
                    'created',
                    'updated',
                    'deleted',
                    'published',
                    'unpublished',
                    'commented',
                    'resolved'
                ]
            },
            userId: { type: 'string' },
            userName: { type: 'string' },
            fieldPath: { type: 'string' },
            before: {},
            after: {},
            timestamp: { type: 'string', format: 'date-time' }
        }
    }
};

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/activity': {
        get: {
            summary: 'Get recent activity for a project',
            tags: ['Activity'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
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
                    description:
                        'List of activity events (newest first). Use nextBefore for pagination.',
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
    },
    '/projects/{projectId}/activity/{resourceType}/{resourceId}': {
        get: {
            summary: 'Get activity for a specific resource',
            tags: ['Activity'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                {
                    name: 'resourceType',
                    in: 'path',
                    required: true,
                    schema: { type: 'string', enum: RESOURCE_TYPES }
                },
                { name: 'resourceId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'List of activity events for the resource (newest first)',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    events: {
                                        type: 'array',
                                        items: { $ref: '#/components/schemas/ActivityEvent' }
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
