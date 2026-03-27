import type { Request, Response } from 'express';
import { Router } from 'express';
import {
    listWebhooks,
    getWebhook,
    createWebhook,
    updateWebhook,
    deleteWebhook,
    rotateSecret,
    sendTestPing,
    getDeliveryLog,
    retryDelivery
} from '@moteurio/core/webhooks/webhookService.js';
import { requireProjectAccess } from '../../middlewares/auth.js';
import type { OpenAPIV3 } from 'openapi-types';
import { sendApiError, getMessage } from '../../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

type WebhookParams = { projectId: string; webhookId?: string; deliveryId?: string };
type WebhookLogQuery = { limit?: string; offset?: string };

function parsePositiveInt(raw: string | undefined, fallback: number): number {
    if (!raw) return fallback;
    const value = parseInt(raw, 10);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
}

router.get('/', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        const list = await listWebhooks(projectId);
        return void res.json(list);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.post('/', requireProjectAccess, async (req: Request<WebhookParams>, res: Response) => {
    const { projectId } = req.params;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    const user = req.user!;
    try {
        const webhook = await createWebhook(projectId, user.id, req.body);
        return void res.status(201).json(webhook);
    } catch (err: unknown) {
        const msg = getMessage(err) ?? 'Failed to create webhook';
        return void res
            .status(msg.includes('required') || msg.includes('Invalid') ? 422 : 400)
            .json({
                error: msg
            });
    }
});

router.get('/:webhookId', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, webhookId } = req.params;
    if (!projectId || !webhookId) return void res.status(400).json({ error: 'Missing parameters' });
    try {
        const webhook = await getWebhook(projectId, webhookId);
        return void res.json(webhook);
    } catch (err: unknown) {
        if (getMessage(err)?.includes('not found'))
            return void res.status(404).json({ error: getMessage(err) });
        return void res.status(500).json({ error: getMessage(err) ?? 'Failed to get webhook' });
    }
});

router.patch(
    '/:webhookId',
    requireProjectAccess,
    async (req: Request<WebhookParams>, res: Response) => {
        const { projectId, webhookId } = req.params;
        if (!projectId || !webhookId)
            return void res.status(400).json({ error: 'Missing parameters' });
        try {
            const webhook = await updateWebhook(projectId, req.user!.id, webhookId, req.body);
            return void res.json(webhook);
        } catch (err: unknown) {
            const msg = getMessage(err) ?? 'Failed to update webhook';
            if (msg.includes('not found')) return void res.status(404).json({ error: msg });
            return void res
                .status(msg.includes('required') || msg.includes('Invalid') ? 422 : 400)
                .json({
                    error: msg
                });
        }
    }
);

router.delete(
    '/:webhookId',
    requireProjectAccess,
    async (req: Request<WebhookParams>, res: Response) => {
        const { projectId, webhookId } = req.params;
        if (!projectId || !webhookId)
            return void res.status(400).json({ error: 'Missing parameters' });
        try {
            await deleteWebhook(projectId, req.user!.id, webhookId);
            return void res.status(204).send();
        } catch (err: unknown) {
            if (getMessage(err)?.includes('not found'))
                return void res.status(404).json({ error: getMessage(err) });
            return void res
                .status(500)
                .json({ error: getMessage(err) ?? 'Failed to delete webhook' });
        }
    }
);

router.post(
    '/:webhookId/rotate-secret',
    requireProjectAccess,
    async (req: Request<WebhookParams>, res: Response) => {
        const { projectId, webhookId } = req.params;
        if (!projectId || !webhookId)
            return void res.status(400).json({ error: 'Missing parameters' });
        try {
            const { secret } = await rotateSecret(projectId, req.user!.id, webhookId);
            return void res.json({ secret });
        } catch (err: unknown) {
            if (getMessage(err)?.includes('not found'))
                return void res.status(404).json({ error: getMessage(err) });
            return void res
                .status(500)
                .json({ error: getMessage(err) ?? 'Failed to rotate secret' });
        }
    }
);

router.post(
    '/:webhookId/test',
    requireProjectAccess,
    async (req: Request<WebhookParams>, res: Response) => {
        const { projectId, webhookId } = req.params;
        if (!projectId || !webhookId)
            return void res.status(400).json({ error: 'Missing parameters' });
        try {
            const delivery = await sendTestPing(projectId, webhookId);
            return void res.json(delivery);
        } catch (err: unknown) {
            if (getMessage(err)?.includes('not found'))
                return void res.status(404).json({ error: getMessage(err) });
            return void res.status(500).json({ error: getMessage(err) ?? 'Failed to send test' });
        }
    }
);

router.get(
    '/:webhookId/log',
    requireProjectAccess,
    async (req: Request<WebhookParams, unknown, unknown, WebhookLogQuery>, res: Response) => {
        const { projectId, webhookId } = req.params;
        const limit = Math.min(parsePositiveInt(req.query.limit, 50), 200);
        const offset = parsePositiveInt(req.query.offset, 0);
        if (!projectId || !webhookId)
            return void res.status(400).json({ error: 'Missing parameters' });
        try {
            const list = await getDeliveryLog(projectId, webhookId, { limit, offset });
            return void res.json(list);
        } catch (err: unknown) {
            return void sendApiError(res, req, err);
        }
    }
);

router.post(
    '/:webhookId/log/:deliveryId/retry',
    requireProjectAccess,
    async (req: Request<WebhookParams>, res: Response) => {
        const { projectId, webhookId, deliveryId } = req.params;
        if (!projectId || !webhookId || !deliveryId)
            return void res.status(400).json({ error: 'Missing parameters' });
        try {
            await retryDelivery(projectId, webhookId, deliveryId);
            return void res.status(204).send();
        } catch (err: unknown) {
            const msg = getMessage(err) ?? 'Failed to retry';
            if (msg.includes('not found')) return void res.status(404).json({ error: msg });
            if (msg.includes('Only failed')) return void res.status(422).json({ error: msg });
            return void res.status(500).json({ error: msg });
        }
    }
);

const whJson = {
    content: {
        'application/json': {
            schema: { $ref: '#/components/schemas/JsonRecord' }
        }
    }
};

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/webhooks': {
        get: {
            summary: 'List webhooks',
            tags: ['Webhooks'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'List of webhooks',
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
            summary: 'Create webhook',
            tags: ['Webhooks'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/JsonRecord' }
                    }
                }
            },
            responses: {
                '201': {
                    description: 'Webhook created',
                    ...whJson
                },
                '422': {
                    description: 'Validation failed',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                }
            }
        }
    },
    '/projects/{projectId}/webhooks/{webhookId}': {
        get: {
            summary: 'Get webhook',
            tags: ['Webhooks'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'webhookId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Webhook',
                    ...whJson
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
            summary: 'Update webhook',
            tags: ['Webhooks'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'webhookId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/JsonRecord' }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Webhook updated',
                    ...whJson
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
            summary: 'Delete webhook',
            tags: ['Webhooks'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'webhookId', in: 'path', required: true, schema: { type: 'string' } }
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
    },
    '/projects/{projectId}/webhooks/{webhookId}/rotate-secret': {
        post: {
            summary: 'Rotate webhook secret',
            tags: ['Webhooks'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'webhookId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'New secret',
                    ...whJson
                }
            }
        }
    },
    '/projects/{projectId}/webhooks/{webhookId}/test': {
        post: {
            summary: 'Send test ping',
            tags: ['Webhooks'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'webhookId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Test sent',
                    ...whJson
                }
            }
        }
    },
    '/projects/{projectId}/webhooks/{webhookId}/log': {
        get: {
            summary: 'Get delivery log',
            tags: ['Webhooks'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'webhookId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'limit', in: 'query', schema: { type: 'integer' } },
                { name: 'offset', in: 'query', schema: { type: 'integer' } }
            ],
            responses: {
                '200': {
                    description: 'Delivery log',
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
        }
    },
    '/projects/{projectId}/webhooks/{webhookId}/log/{deliveryId}/retry': {
        post: {
            summary: 'Retry failed delivery',
            tags: ['Webhooks'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'webhookId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'deliveryId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '204': { description: 'Retry queued' },
                '404': {
                    description: 'Not found',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                },
                '422': {
                    description: 'Only failed deliveries can be retried',
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
