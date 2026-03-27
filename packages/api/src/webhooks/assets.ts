import express, { type Request, type Response } from 'express';
import { handleProviderWebhook } from '@moteurio/core/assets/assetService.js';
import { verifyProviderWebhookAndGetProjectId } from '@moteurio/core/assets/providerRegistry.js';
import type { OpenAPIV3 } from 'openapi-types';

const router: express.Router = express.Router();

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/webhooks/mux': {
        post: {
            summary: 'Mux webhook',
            description:
                'Webhook endpoint for Mux video provider. Verifies mux-signature header. No auth; signature required.',
            tags: ['Webhooks'],
            security: [],
            parameters: [
                { name: 'mux-signature', in: 'header', required: true, schema: { type: 'string' } }
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
                    description: 'Accepted',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/JsonRecord' }
                        }
                    }
                },
                '400': {
                    description: 'Invalid signature',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                }
            }
        }
    },
    '/webhooks/vimeo': {
        post: {
            summary: 'Vimeo webhook',
            description:
                'Webhook endpoint for Vimeo video provider. Verifies x-vimeo-signature or vimeo-signature. No auth; signature required.',
            tags: ['Webhooks'],
            security: [],
            parameters: [
                { name: 'x-vimeo-signature', in: 'header', schema: { type: 'string' } },
                { name: 'vimeo-signature', in: 'header', schema: { type: 'string' } }
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
                    description: 'Accepted',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/JsonRecord' }
                        }
                    }
                },
                '400': {
                    description: 'Invalid signature',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                }
            }
        }
    },
    '/webhooks/cloudflare-stream': {
        post: {
            summary: 'Cloudflare Stream webhook',
            description:
                'Webhook endpoint for Cloudflare Stream. Verifies Webhook-Signature header (time + sig1 HMAC). No auth; signature required.',
            tags: ['Webhooks'],
            security: [],
            parameters: [
                {
                    name: 'Webhook-Signature',
                    in: 'header',
                    required: true,
                    schema: { type: 'string' }
                }
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
                    description: 'Accepted',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/JsonRecord' }
                        }
                    }
                },
                '400': {
                    description: 'Invalid signature',
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

function getRawBody(req: Request): string {
    const raw = req.rawBody;
    if (typeof raw === 'string') return raw;
    if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
    return JSON.stringify(req.body ?? {});
}

router.post('/mux', async (req: Request, res: Response) => {
    const signature = (req.headers['mux-signature'] as string) ?? '';
    const rawBody = getRawBody(req);
    const verified = await verifyProviderWebhookAndGetProjectId('mux', rawBody, signature);
    if (!verified) {
        res.status(400).end();
        return;
    }
    res.status(200).send();
    setImmediate(async () => {
        try {
            const payload = rawBody ? JSON.parse(rawBody) : {};
            await handleProviderWebhook('mux', payload, signature, verified);
        } catch {
            // ignore
        }
    });
});

router.post('/vimeo', async (req: Request, res: Response) => {
    const signature = (req.headers['x-vimeo-signature'] ??
        req.headers['vimeo-signature'] ??
        '') as string;
    const rawBody = getRawBody(req);
    const verified = await verifyProviderWebhookAndGetProjectId('vimeo', rawBody, signature);
    if (!verified) {
        res.status(400).end();
        return;
    }
    res.status(200).send();
    setImmediate(async () => {
        try {
            const payload = rawBody ? JSON.parse(rawBody) : {};
            await handleProviderWebhook('vimeo', payload, signature, verified);
        } catch {
            // ignore
        }
    });
});

router.post('/cloudflare-stream', async (req: Request, res: Response) => {
    const signature = (req.headers['webhook-signature'] as string) ?? '';
    const rawBody = getRawBody(req);
    const verified = await verifyProviderWebhookAndGetProjectId(
        'cloudflare-stream',
        rawBody,
        signature
    );
    if (!verified) {
        res.status(400).end();
        return;
    }
    res.status(200).send();
    setImmediate(async () => {
        try {
            const payload = rawBody ? JSON.parse(rawBody) : {};
            await handleProviderWebhook('cloudflare-stream', payload, signature, verified);
        } catch {
            // ignore
        }
    });
});

export default router;
