import type { Request, Response } from 'express';
import express, { Router } from 'express';
import { generateJWT } from '@moteurio/core/auth.js';
import { requireAuth } from '../middlewares/auth.js';
import type { OpenAPIV3 } from 'openapi-types';

const router: Router = express.Router();

router.post('/refresh', requireAuth, async (req: Request, res: Response) => {
    try {
        const user = req.user;
        if (!user) {
            return void res.status(401).json({ error: 'Unauthorized' });
        }
        return void res.json({ token: generateJWT(user) });
    } catch (_err) {
        return void res.status(401).json({ error: 'Invalid or expired token' });
    }
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/auth/refresh': {
        post: {
            summary: 'Refresh the JWT',
            tags: ['Auth'],
            security: [{ bearerAuth: [] }],
            responses: {
                '200': {
                    description: 'New JWT token',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    token: { type: 'string' }
                                }
                            }
                        }
                    }
                },
                '401': {
                    description: 'Unauthorized or invalid user',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    error: { type: 'string' }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
};

export default router;
