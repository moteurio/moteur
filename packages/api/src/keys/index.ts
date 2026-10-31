import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import {
    findProjectForApiKey,
    verifyProjectApiKey,
    type VerifyProjectApiKeyResult
} from '@moteurio/core/projectApiKey.js';
import { requestHostMatchesAllowed } from '@moteurio/core/apiKeyAllowedHosts.js';
import { listChannels } from '@moteurio/core/channels.js';
import { noteApiKeyUse } from '@moteurio/core/apiKeyUsage.js';
import { sendApiError } from '../utils/apiError.js';

const router: Router = Router();

/**
 * Who a project key is: its project and the channels it reads, so a site needs its key alone.
 * `channel` is the one to read when there's no doubt: the key's only channel, or `site`.
 */
router.get('/me', async (req: Request, res: Response) => {
    const rawKey = (req.headers['x-api-key'] as string | undefined)?.trim() ?? '';
    if (!rawKey)
        return void res.status(401).json({ error: 'Send the key in the x-api-key header' });
    try {
        const projectId = findProjectForApiKey(rawKey);
        const result: VerifyProjectApiKeyResult = projectId
            ? await verifyProjectApiKey(projectId, rawKey)
            : { ok: false };
        if (!projectId || !result.ok) {
            return void res
                .status(401)
                .json(
                    !result.ok && result.reason === 'expired'
                        ? { error: 'API key expired', code: 'API_KEY_EXPIRED' }
                        : { error: 'Invalid API key' }
                );
        }
        if (result.allowedHosts?.length) {
            const hostCheck = requestHostMatchesAllowed(
                { origin: req.headers.origin, referer: req.headers.referer },
                result.allowedHosts
            );
            if (!hostCheck.ok) {
                return void res.status(403).json({
                    error: 'API key is restricted to allowed hosts; send a valid Origin or Referer header',
                    code: 'API_KEY_HOST_NOT_ALLOWED'
                });
            }
        }
        noteApiKeyUse(projectId, result.keyId);
        const all = (await listChannels(projectId)).map(c => c.id);
        const only = result.policy.channelAllowlist;
        const channels = only ? all.filter(id => only.includes(id)) : all;
        const channel =
            channels.length === 1 ? channels[0] : channels.includes('site') ? 'site' : undefined;
        res.setHeader('Cache-Control', 'no-store');
        return void res.json({
            projectId,
            keyId: result.keyId,
            channels,
            ...(channel ? { channel } : {}),
            siteWide: result.policy.allowSiteWideReads
        });
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/keys/me': {
        get: {
            summary: 'The project and channels of a project key',
            description:
                "Send a project key in `x-api-key`; the answer says its project and the channels it reads. `channel` is the one to read when there's no doubt: the key's only channel, or `site`. What lets a site be configured with its key alone.",
            tags: ['Public API — Channels'],
            security: [{ ApiKeyAuth: [] }],
            responses: {
                '200': {
                    description: 'The key',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['projectId', 'keyId', 'channels', 'siteWide'],
                                properties: {
                                    projectId: { type: 'string' },
                                    keyId: { type: 'string' },
                                    channels: { type: 'array', items: { type: 'string' } },
                                    channel: { type: 'string' },
                                    siteWide: {
                                        type: 'boolean',
                                        description:
                                            'Whether it also reads sitemap, navigation, urls, breadcrumb and radar'
                                    }
                                }
                            }
                        }
                    }
                },
                '401': { description: 'No key, an unknown key, or an expired one' },
                '403': { description: 'The key is restricted to other hosts' }
            }
        }
    }
};

export default router;
