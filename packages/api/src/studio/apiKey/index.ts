import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import {
    generateKey,
    rotateKey,
    revokeKey,
    updateApiKeyAllowedHosts
} from '@moteurio/core/projectApiKey.js';
import { getProject } from '@moteurio/core/projects.js';
import { requireProjectAccess } from '../../middlewares/auth.js';
import { sendApiError } from '../../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

router.post('/generate', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        const { rawKey, prefix } = await generateKey(projectId, req.user!);
        return void res.status(201).json({
            prefix,
            rawKey,
            message: 'Store this key securely. It will not be shown again.'
        });
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.post('/rotate', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        const { rawKey, prefix } = await rotateKey(projectId, req.user!);
        return void res.json({
            prefix,
            rawKey,
            message: 'Store this key securely. It will not be shown again.'
        });
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.delete('/', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        await revokeKey(projectId, req.user!);
        return void res.status(204).send();
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.get('/', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        const project = await getProject(req.user!, projectId);
        if (!project.apiKey) {
            return void res.json({ prefix: null, createdAt: null, allowedHosts: null });
        }
        return void res.json({
            prefix: project.apiKey.prefix,
            createdAt: project.apiKey.createdAt,
            allowedHosts: project.apiKey.allowedHosts ?? []
        });
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.patch('/allowed-hosts', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        const body = req.body ?? {};
        const { allowedHosts } = body as { allowedHosts?: unknown };
        if (allowedHosts === undefined) {
            return void res.status(400).json({ error: 'allowedHosts is required' });
        }
        const { allowedHosts: next } = await updateApiKeyAllowedHosts(
            projectId,
            req.user!,
            allowedHosts
        );
        return void res.json({ allowedHosts: next });
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/api-key/generate': {
        post: {
            summary: 'Generate project API key',
            tags: ['Project API key'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '201': {
                    description: 'Returns rawKey (once) and prefix',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ApiKeyGenerateResponse' }
                        }
                    }
                }
            }
        }
    },
    '/projects/{projectId}/api-key/rotate': {
        post: {
            summary: 'Rotate project API key',
            tags: ['Project API key'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'New rawKey and prefix',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ApiKeyGenerateResponse' }
                        }
                    }
                }
            }
        }
    },
    '/projects/{projectId}/api-key': {
        get: {
            summary: 'Get API key metadata (prefix, createdAt, allowedHosts)',
            tags: ['Project API key'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'prefix, createdAt, allowedHosts',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ApiKeyMetaResponse' }
                        }
                    }
                }
            }
        },
        delete: {
            summary: 'Revoke API key',
            tags: ['Project API key'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: { '204': { description: 'Revoked' } }
        }
    },
    '/projects/{projectId}/api-key/allowed-hosts': {
        patch: {
            summary: 'Set API key allowed host patterns',
            description:
                'Requires an existing API key. Empty allowedHosts removes host restriction. Non-empty enforces Origin/Referer hostname match (strict).',
            tags: ['Project API key'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/ApiKeyAllowedHostsRequest' }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Updated allowedHosts',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ApiKeyAllowedHostsResponse' }
                        }
                    }
                }
            }
        }
    }
};

export default router;
