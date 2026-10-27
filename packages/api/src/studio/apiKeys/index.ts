import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import {
    createKey,
    rotateKey,
    revokeKey,
    patchKey,
    listProjectApiKeyMeta
} from '@moteurio/core/projectApiKey.js';
import { requireDeveloper } from '../../middlewares/auth.js';
import { sendApiError } from '../../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

router.get('/', requireDeveloper, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        const keys = await listProjectApiKeyMeta(projectId, req.user!);
        return void res.json(keys);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.post('/', requireDeveloper, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        const body = req.body ?? {};
        const { label, expiresAt, allowedChannelIds, allowSiteWideReads } = body as {
            label?: string;
            expiresAt?: string | null;
            allowedChannelIds?: string[];
            allowSiteWideReads?: boolean;
        };
        const { rawKey, prefix, meta } = await createKey(projectId, req.user!, {
            ...(label !== undefined ? { label } : {}),
            ...(expiresAt !== undefined ? { expiresAt } : {}),
            ...(allowedChannelIds !== undefined ? { allowedChannelIds } : {}),
            ...(allowSiteWideReads !== undefined ? { allowSiteWideReads } : {})
        });
        return void res.status(201).json({
            ...meta,
            rawKey,
            prefix,
            message: 'Store this key securely. It will not be shown again.'
        });
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.post('/:keyId/rotate', requireDeveloper, async (req: Request, res: Response) => {
    const { projectId, keyId } = req.params as Record<string, string>;
    if (!projectId || !keyId)
        return void res.status(400).json({ error: 'Missing projectId or keyId' });
    try {
        const { rawKey, prefix, meta } = await rotateKey(projectId, req.user!, keyId);
        return void res.json({
            ...meta,
            rawKey,
            prefix,
            message: 'Store this key securely. It will not be shown again.'
        });
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.delete('/:keyId', requireDeveloper, async (req: Request, res: Response) => {
    const { projectId, keyId } = req.params as Record<string, string>;
    if (!projectId || !keyId)
        return void res.status(400).json({ error: 'Missing projectId or keyId' });
    try {
        await revokeKey(projectId, req.user!, keyId);
        return void res.status(204).send();
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.patch('/:keyId', requireDeveloper, async (req: Request, res: Response) => {
    const { projectId, keyId } = req.params as Record<string, string>;
    if (!projectId || !keyId)
        return void res.status(400).json({ error: 'Missing projectId or keyId' });
    try {
        const body = req.body ?? {};
        const { label, expiresAt, allowedHosts, allowedChannelIds, allowSiteWideReads } = body as {
            label?: string | null;
            expiresAt?: string | null;
            allowedHosts?: unknown;
            allowedChannelIds?: string[] | null;
            allowSiteWideReads?: boolean;
        };
        const hasAny =
            label !== undefined ||
            expiresAt !== undefined ||
            allowedHosts !== undefined ||
            allowedChannelIds !== undefined ||
            allowSiteWideReads !== undefined;
        if (!hasAny) {
            return void res.status(400).json({ error: 'No fields to update' });
        }
        const meta = await patchKey(projectId, req.user!, keyId, {
            ...(label !== undefined ? { label } : {}),
            ...(expiresAt !== undefined ? { expiresAt } : {}),
            ...(allowedHosts !== undefined ? { allowedHosts } : {}),
            ...(allowedChannelIds !== undefined ? { allowedChannelIds } : {}),
            ...(allowSiteWideReads !== undefined ? { allowSiteWideReads } : {})
        });
        return void res.json(meta);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/api-keys': {
        get: {
            summary: 'List project API keys (metadata only)',
            tags: ['Project API keys'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Array of key metadata',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'array',
                                items: { $ref: '#/components/schemas/ProjectApiKeyMeta' }
                            }
                        }
                    }
                }
            }
        },
        post: {
            summary: 'Create a project API key',
            tags: ['Project API keys'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/ProjectApiKeyCreateRequest' }
                    }
                }
            },
            responses: {
                '201': {
                    description: 'Returns rawKey once and metadata',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ProjectApiKeyCreateResponse' }
                        }
                    }
                }
            }
        }
    },
    '/projects/{projectId}/api-keys/{keyId}/rotate': {
        post: {
            summary: 'Rotate one API key',
            tags: ['Project API keys'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                {
                    name: 'keyId',
                    in: 'path',
                    required: true,
                    schema: { type: 'string', format: 'uuid' }
                }
            ],
            responses: {
                '200': {
                    description: 'New rawKey and metadata',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ProjectApiKeyCreateResponse' }
                        }
                    }
                }
            }
        }
    },
    '/projects/{projectId}/api-keys/{keyId}': {
        delete: {
            summary: 'Revoke one API key',
            tags: ['Project API keys'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                {
                    name: 'keyId',
                    in: 'path',
                    required: true,
                    schema: { type: 'string', format: 'uuid' }
                }
            ],
            responses: { '204': { description: 'Revoked' } }
        },
        patch: {
            summary: 'Update API key restrictions (not the secret)',
            tags: ['Project API keys'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                {
                    name: 'keyId',
                    in: 'path',
                    required: true,
                    schema: { type: 'string', format: 'uuid' }
                }
            ],
            requestBody: {
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/ProjectApiKeyPatchRequest' }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Updated metadata',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ProjectApiKeyMeta' }
                        }
                    }
                }
            }
        }
    }
};

export default router;
