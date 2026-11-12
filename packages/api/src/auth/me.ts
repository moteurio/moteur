import type { Request, Response } from 'express';
import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { getProjectIdsForUser } from '@moteurio/core/projects.js';
import { updateStoredUser, withoutSecrets } from '@moteurio/core/users.js';
import { workspacesOf } from '@moteurio/core/workspaces.js';
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
    res.json({ user: { ...safeUser, projects, workspaces: workspacesBrief(user.id) } });
});

/**
 * Lists the workspaces a user belongs to with their role in each. This is enough to render a
 * workspace switcher and to work out the user's roles in a workspace's projects (`asOwnWorkspace`).
 */
function workspacesBrief(userId: string) {
    return workspacesOf(userId).map(w => {
        const { role, access, projectRoles } = w.members[userId]!;
        return {
            id: w.id,
            name: w.name,
            personal: !!w.personal,
            role,
            ...(access && { access }),
            ...(projectRoles && { projectRoles })
        };
    });
}

/** Updates the user's display name, which is also used in emails. Body: `{ name }`. */
router.patch('/me', requireAuth, async (req: Request, res: Response) => {
    const raw = (req.body ?? {}).name;
    const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
    if (!name || name.length > 120)
        return void res
            .status(400)
            .json({ error: 'A name is 1 to 120 characters.', code: 'NAME_INVALID' });
    try {
        const saved = await updateStoredUser(req.user!.id, u => ({ ...u, name }));
        res.json({
            user: {
                ...withoutSecrets(saved),
                projects: getProjectIdsForUser(saved.id),
                workspaces: workspacesBrief(saved.id)
            }
        });
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
            description:
                'You, without secrets, with `projects` (the ids of every project you are in) and `workspaces` (`{ id, name, personal, role }` for each workspace you are a member of).',
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
