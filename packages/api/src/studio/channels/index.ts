import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import {
    listChannels,
    getChannel,
    createChannel,
    updateChannel,
    deleteChannel
} from '@moteurio/core/channels.js';
import { requireDeveloper } from '../../middlewares/auth.js';
import { sendApiError, getMessage } from '../../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

router.get('/', requireDeveloper, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        const list = await listChannels(projectId);
        return void res.json(list);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.get('/:id', requireDeveloper, async (req: Request, res: Response) => {
    const { projectId, id } = req.params as Record<string, string>;
    if (!projectId || !id) return void res.status(400).json({ error: 'Missing projectId or id' });
    try {
        const channel = await getChannel(projectId, id);
        if (!channel) return void res.status(404).json({ error: 'Channel not found' });
        return void res.json(channel);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.post('/', requireDeveloper, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        const { id, label, description, resources } = req.body ?? {};
        const channel = await createChannel(projectId, req.user!, {
            id,
            label: label ?? 'Unnamed',
            description,
            resources: resources ?? []
        });
        return void res.status(201).json(channel);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.patch('/:id', requireDeveloper, async (req: Request, res: Response) => {
    const { projectId, id } = req.params as Record<string, string>;
    if (!projectId || !id) return void res.status(400).json({ error: 'Missing projectId or id' });
    try {
        const patch = req.body ?? {};
        const channel = await updateChannel(projectId, req.user!, id, patch);
        return void res.json(channel);
    } catch (err: unknown) {
        return void res.status(getMessage(err)?.includes('not found') ? 404 : 400).json({
            error: getMessage(err) ?? 'Failed to update channel'
        });
    }
});

router.delete('/:id', requireDeveloper, async (req: Request, res: Response) => {
    const { projectId, id } = req.params as Record<string, string>;
    if (!projectId || !id) return void res.status(400).json({ error: 'Missing projectId or id' });
    try {
        await deleteChannel(projectId, req.user!, id);
        return void res.status(204).send();
    } catch (err: unknown) {
        return void res.status(getMessage(err)?.includes('not found') ? 404 : 400).json({
            error: getMessage(err) ?? 'Failed to delete channel'
        });
    }
});

const collJson = {
    content: {
        'application/json': {
            schema: { $ref: '#/components/schemas/Channel' }
        }
    }
};

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/channels': {
        get: {
            summary: 'List channels',
            tags: ['Channels'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'List of channels',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'array',
                                items: { $ref: '#/components/schemas/Channel' }
                            }
                        }
                    }
                }
            }
        },
        post: {
            summary: 'Create channel',
            tags: ['Channels'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                label: { type: 'string' },
                                description: { type: 'string' },
                                resources: {
                                    type: 'array',
                                    items: { $ref: '#/components/schemas/ChannelResource' }
                                }
                            }
                        }
                    }
                }
            },
            responses: {
                '201': {
                    description: 'Created channel',
                    ...collJson
                }
            }
        }
    },
    '/projects/{projectId}/channels/{id}': {
        get: {
            summary: 'Get one channel',
            tags: ['Channels'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Channel',
                    ...collJson
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
        patch: {
            summary: 'Update channel',
            tags: ['Channels'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Updated channel',
                    ...collJson
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
            summary: 'Delete channel',
            tags: ['Channels'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '204': { description: 'Deleted' },
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
