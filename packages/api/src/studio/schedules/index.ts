import type { Request, Response } from 'express';
import { Router } from 'express';
import {
    listSchedules,
    getSchedule,
    createSchedule,
    cancelSchedule,
    deleteSchedule,
    type CreateScheduleInput,
    type ListSchedulesOptions
} from '@moteurio/core/schedules.js';
import type { ScheduleAction, ScheduleResourceType, ScheduleStatus } from '@moteurio/types';
import { requireProjectAccess } from '../../middlewares/auth.js';
import type { OpenAPIV3 } from 'openapi-types';
import { sendApiError } from '../../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

const RESOURCE_TYPES = new Set<ScheduleResourceType>(['entry', 'page']);
const ACTIONS = new Set<ScheduleAction>(['publish', 'unpublish']);
const STATUSES = new Set<ScheduleStatus>(['pending', 'processing', 'done', 'failed', 'cancelled']);

function asString(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) {
        return value[0].trim();
    }
    return undefined;
}

function parseListOptions(query: Request['query']): ListSchedulesOptions {
    const options: ListSchedulesOptions = {};

    const resourceType = asString(query.resourceType);
    if (resourceType && RESOURCE_TYPES.has(resourceType as ScheduleResourceType)) {
        options.resourceType = resourceType as ScheduleResourceType;
    }

    const resourceId = asString(query.resourceId);
    if (resourceId) options.resourceId = resourceId;

    const action = asString(query.action);
    if (action && ACTIONS.has(action as ScheduleAction)) {
        options.action = action as ScheduleAction;
    }

    const statusRaw = query.status;
    const statusParts: string[] = [];
    if (typeof statusRaw === 'string' && statusRaw.trim()) {
        statusParts.push(
            ...statusRaw
                .split(',')
                .map(s => s.trim())
                .filter(Boolean)
        );
    } else if (Array.isArray(statusRaw)) {
        for (const item of statusRaw) {
            if (typeof item === 'string' && item.trim()) {
                statusParts.push(
                    ...item
                        .split(',')
                        .map(s => s.trim())
                        .filter(Boolean)
                );
            }
        }
    }
    const statuses = statusParts.filter((s): s is ScheduleStatus =>
        STATUSES.has(s as ScheduleStatus)
    );
    if (statuses.length === 1) options.status = statuses[0];
    else if (statuses.length > 1) options.status = statuses;

    return options;
}

router.get('/', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        const schedules = await listSchedules(req.user!, projectId, parseListOptions(req.query));
        return void res.json(schedules);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.get('/:scheduleId', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, scheduleId } = req.params as Record<string, string>;
    if (!projectId || !scheduleId) {
        return void res.status(400).json({ error: 'Missing projectId or scheduleId' });
    }
    try {
        const schedule = await getSchedule(req.user!, projectId, scheduleId);
        return void res.json(schedule);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.post('/', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        const body = (req.body ?? {}) as CreateScheduleInput;
        const schedule = await createSchedule(req.user!, projectId, body);
        return void res.status(201).json(schedule);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.post('/:scheduleId/cancel', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, scheduleId } = req.params as Record<string, string>;
    if (!projectId || !scheduleId) {
        return void res.status(400).json({ error: 'Missing projectId or scheduleId' });
    }
    try {
        const schedule = await cancelSchedule(req.user!, projectId, scheduleId);
        return void res.json(schedule);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.delete('/:scheduleId', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, scheduleId } = req.params as Record<string, string>;
    if (!projectId || !scheduleId) {
        return void res.status(400).json({ error: 'Missing projectId or scheduleId' });
    }
    try {
        await deleteSchedule(req.user!, projectId, scheduleId);
        return void res.status(204).send();
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

const scheduleJson = {
    content: {
        'application/json': {
            schema: { $ref: '#/components/schemas/JsonRecord' }
        }
    }
};

const projectIdParam = {
    name: 'projectId',
    in: 'path' as const,
    required: true,
    schema: { type: 'string' as const }
};

const scheduleIdParam = {
    name: 'scheduleId',
    in: 'path' as const,
    required: true,
    schema: { type: 'string' as const }
};

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/schedules': {
        get: {
            summary: 'List schedules',
            tags: ['Schedules'],
            parameters: [
                projectIdParam,
                {
                    name: 'resourceType',
                    in: 'query',
                    schema: { type: 'string', enum: ['entry', 'page'] }
                },
                { name: 'resourceId', in: 'query', schema: { type: 'string' } },
                {
                    name: 'status',
                    in: 'query',
                    description: 'Single status, comma-separated list, or repeated query param',
                    schema: { type: 'string' }
                },
                {
                    name: 'action',
                    in: 'query',
                    schema: { type: 'string', enum: ['publish', 'unpublish'] }
                }
            ],
            responses: {
                '200': {
                    description: 'List of schedules (sorted by scheduledAt ascending)',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'array',
                                items: { $ref: '#/components/schemas/JsonRecord' }
                            }
                        }
                    }
                }
            }
        },
        post: {
            summary: 'Create schedule',
            tags: ['Schedules'],
            parameters: [projectIdParam],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            required: ['resourceType', 'resourceId', 'action', 'scheduledAt'],
                            properties: {
                                resourceType: { type: 'string', enum: ['entry', 'page'] },
                                resourceId: { type: 'string' },
                                modelId: {
                                    type: 'string',
                                    description: 'Required when resourceType is entry'
                                },
                                action: { type: 'string', enum: ['publish', 'unpublish'] },
                                scheduledAt: {
                                    type: 'string',
                                    format: 'date-time',
                                    description: 'ISO 8601; must be in the future'
                                }
                            }
                        }
                    }
                }
            },
            responses: {
                '201': {
                    description: 'Schedule created',
                    ...scheduleJson
                },
                '400': {
                    description: 'Bad request',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                },
                '403': {
                    description: 'Forbidden (e.g. workflow requireReview)',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                }
            }
        }
    },
    '/projects/{projectId}/schedules/{scheduleId}': {
        get: {
            summary: 'Get schedule by id',
            tags: ['Schedules'],
            parameters: [projectIdParam, scheduleIdParam],
            responses: {
                '200': {
                    description: 'Schedule',
                    ...scheduleJson
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
        },
        delete: {
            summary: 'Delete schedule',
            description:
                'Only terminal schedules (done, failed, cancelled). Pending/processing must be cancelled first.',
            tags: ['Schedules'],
            parameters: [projectIdParam, scheduleIdParam],
            responses: {
                '204': { description: 'Deleted' },
                '400': {
                    description: 'Cannot delete pending/processing schedule',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
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
    },
    '/projects/{projectId}/schedules/{scheduleId}/cancel': {
        post: {
            summary: 'Cancel a pending schedule',
            tags: ['Schedules'],
            parameters: [projectIdParam, scheduleIdParam],
            responses: {
                '200': {
                    description: 'Schedule cancelled',
                    ...scheduleJson
                },
                '400': {
                    description: 'Schedule is not pending',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
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
