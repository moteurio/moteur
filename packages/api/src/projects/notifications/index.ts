import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import { getNotifications, markRead, markAllRead } from '@moteurio/core/notifications.js';
import { requireProjectAccess } from '../../middlewares/auth.js';
import { getMessage } from '../../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

router.get('/', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params;
    const userId = req.user!.id;
    const unreadOnly = req.query.unreadOnly !== 'false' && req.query.unreadOnly !== '0';
    try {
        const notifications = await getNotifications(projectId, userId, unreadOnly);
        return void res.json({ notifications });
    } catch {
        return void res.status(500).json({ error: 'Failed to get notifications' });
    }
});

router.post('/read-all', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params;
    const userId = req.user!.id;
    try {
        await markAllRead(projectId, userId);
        return void res.status(204).send();
    } catch {
        return void res.status(500).json({ error: 'Failed to mark all as read' });
    }
});

router.post('/:id/read', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, id } = req.params;
    const userId = req.user!.id;
    try {
        const notification = await markRead(projectId, userId, id);
        return void res.json({ notification });
    } catch (err: unknown) {
        return void res.status(getMessage(err)?.includes('not found') ? 404 : 400).json({
            error: getMessage(err) ?? 'Failed to mark as read'
        });
    }
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/notifications': {
        get: {
            summary: 'List notifications for current user (default unread only)',
            tags: ['Notifications'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'unreadOnly', in: 'query', schema: { type: 'boolean', default: true } }
            ],
            responses: {
                '200': {
                    description: 'List of notifications',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    notifications: {
                                        type: 'array',
                                        items: { type: 'object' }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    },
    '/projects/{projectId}/notifications/{id}/read': {
        post: {
            summary: 'Mark a notification as read',
            tags: ['Notifications'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Notification',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: { notification: { type: 'object' } }
                            }
                        }
                    }
                },
                '404': { description: 'Notification not found' }
            }
        }
    },
    '/projects/{projectId}/notifications/read-all': {
        post: {
            summary: 'Mark all notifications as read for current user',
            tags: ['Notifications'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '204': { description: 'All marked as read' }
            }
        }
    }
};

export default router;
