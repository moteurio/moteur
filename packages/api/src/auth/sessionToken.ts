import type { Request, Response } from 'express';
import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { generateSessionToken } from '@moteurio/core/auth.js';
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
    const sessionToken = generateSessionToken(user, ttlSeconds);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    res.json({ sessionToken, expiresAt });
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/auth/session-token': {
        post: {
            summary: 'Exchange user token for a short-lived session token (e.g. web Atelier)',
            tags: ['Auth'],
            security: [{ bearerAuth: [] }],
            requestBody: {
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                ttlSeconds: { type: 'integer', minimum: 60, maximum: 28800 }
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
