import type { Request, Response } from 'express';
import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { generateSessionToken, verifyJWT } from '@moteurio/core/auth.js';
import { getUserById } from '@moteurio/core/users.js';
import type { OpenAPIV3 } from 'openapi-types';

const router: Router = Router();

const DEFAULT_TTL_SECONDS = 28800; // 8 hours
const MAX_TTL_SECONDS = 8 * 60 * 60;

router.post('/', requireAuth, (req: Request, res: Response) => {
    const user = req.user;
    if (!user?.id) {
        return void res.status(401).json({ error: 'Unauthorized' });
    }
    const ttlSeconds =
        typeof req.body?.ttlSeconds === 'number'
            ? Math.min(Math.max(Math.floor(req.body.ttlSeconds), 60), MAX_TTL_SECONDS)
            : DEFAULT_TTL_SECONDS;
    // An agent's token: changes go to review unless the person allows more. A token minted by
    // an agent keeps its agent, and can't loosen review-only.
    const asked = req.body?.agent as { name?: unknown; reviewOnly?: unknown } | undefined;
    const agent =
        user.agent ??
        (asked && typeof asked.name === 'string' && asked.name.trim()
            ? { name: asked.name.trim().slice(0, 40), reviewOnly: asked.reviewOnly !== false }
            : undefined);
    if (asked && !agent) {
        return void res.status(400).json({ error: '"agent.name" is required' });
    }
    const account = user.agent ? { ...getUserById(user.id)!, agent } : { ...user, agent };
    const payload = verifyJWT(req.headers.authorization!.replace(/^Bearer\s+/i, ''));
    const sessionToken = generateSessionToken(agent ? account : user, ttlSeconds, payload);
    const expiresAt = new Date(verifyJWT(sessionToken).exp! * 1000).toISOString();
    res.json({ sessionToken, expiresAt });
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/auth/session-token': {
        post: {
            summary: 'Exchange user token for a short-lived session token (web Atelier, agents)',
            tags: ['Auth'],
            security: [{ bearerAuth: [] }],
            requestBody: {
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                ttlSeconds: { type: 'integer', minimum: 60, maximum: 28800 },
                                agent: {
                                    type: 'object',
                                    description:
                                        'Give the token to an agent acting for you: its changes are marked, and with reviewOnly (default) go live only once a person approves them. A token minted with an agent token keeps its agent.',
                                    properties: {
                                        name: { type: 'string', maxLength: 40 },
                                        reviewOnly: { type: 'boolean', default: true }
                                    },
                                    required: ['name']
                                }
                            }
                        }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Session token',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    sessionToken: { type: 'string' },
                                    expiresAt: { type: 'string', format: 'date-time' }
                                }
                            }
                        }
                    }
                },
                '401': {
                    description: 'Unauthorized',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: { error: { type: 'string' } }
                            }
                        }
                    }
                }
            }
        }
    }
};

export default router;
