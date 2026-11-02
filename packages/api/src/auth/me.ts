import type { Request, Response } from 'express';
import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { getProjectIdsForUser } from '@moteurio/core/projects.js';
import { updateStoredUser, withoutSecrets } from '@moteurio/core/users.js';
import { sendApiError } from '../utils/apiError.js';
import type { OpenAPIV3 } from 'openapi-types';

const router: Router = Router();

router.get('/me', requireAuth, (req: Request, res: Response) => {
    const user = req.user;

    if (!user) {
        return void res.status(401).json({ error: 'Unauthorized' });
    }

    const projects = getProjectIdsForUser(user.id);
    const safeUser = withoutSecrets(user);
    res.json({ user: { ...safeUser, projects } });
});

/** Body `{ name }`: what you're called, everywhere in the Studio and its emails. */
router.patch('/me', requireAuth, async (req: Request, res: Response) => {
    const raw = (req.body ?? {}).name;
    const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
    if (!name || name.length > 120)
        return void res
            .status(400)
            .json({ error: 'A name is 1 to 120 characters.', code: 'NAME_INVALID' });
    try {
        const saved = await updateStoredUser(req.user!.id, u => ({ ...u, name }));
        res.json({ user: { ...withoutSecrets(saved), projects: getProjectIdsForUser(saved.id) } });
    } catch (err) {
        sendApiError(res, req, err);
    }
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/auth/me': {
        patch: {
            summary: 'Change your name',
            description:
                'Body `{ name }` (1 to 120 characters). What you are called everywhere: the Studio, other people’s screens, emails.',
            tags: ['Auth'],
            security: [{ bearerAuth: [] }],
            requestBody: {
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            required: ['name'],
                            properties: { name: { type: 'string' } }
                        }
                    }
                }
            },
            responses: {
                '200': {
                    description: '`{ user }`: you, renamed',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: { user: { $ref: '#/components/schemas/User' } }
                            }
                        }
                    }
                },
                '400': { description: 'Not a name (`NAME_INVALID`)' }
            }
        },
        get: {
            summary: 'Get current authenticated user',
            tags: ['Auth'],
            security: [{ bearerAuth: [] }],
            responses: {
                '200': {
                    description: 'Current user',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    user: { $ref: '#/components/schemas/User' }
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
