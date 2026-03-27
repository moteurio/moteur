import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import { requireProjectAccess } from '../middlewares/auth.js';
import {
    getProjectUsers,
    updateUserAsOperator,
    type OperatorUserPatch
} from '@moteurio/core/users.js';
import { sendApiError } from '../utils/apiError.js';
import { getOnlineUserIdsForProject } from '@moteurio/presence';

const router: Router = Router({ mergeParams: true });

function toProjectUserDto(
    u: {
        id: string;
        name?: string;
        email: string;
        avatar?: string;
        roles: string[];
        isActive: boolean;
        lastLoginAt?: string;
    },
    online: Set<string>
) {
    return {
        id: u.id,
        name: u.name,
        email: u.email,
        avatar: u.avatar,
        roles: u.roles,
        isActive: u.isActive,
        lastLoginAt: u.lastLoginAt,
        online: online.has(u.id)
    };
}

router.get('/:projectId/users', requireProjectAccess, (req: Request, res: Response) => {
    const { projectId } = req.params;

    if (!projectId) {
        return void res.status(400).json({ error: 'Missing projectId' });
    }

    try {
        const online = new Set(getOnlineUserIdsForProject(projectId));
        const users = getProjectUsers(projectId).map(u =>
            toProjectUserDto(
                {
                    id: u.id,
                    name: u.name,
                    email: u.email,
                    avatar: u.avatar,
                    roles: u.roles,
                    isActive: u.isActive,
                    lastLoginAt: u.lastLoginAt
                },
                online
            )
        );
        return void res.json({ users });
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.patch('/:projectId/users/:userId', requireProjectAccess, (req: Request, res: Response) => {
    const { projectId, userId } = req.params;
    const actor = req.user;

    if (!projectId || !userId) {
        return void res.status(400).json({ error: 'Missing projectId or userId' });
    }
    if (!actor?.roles?.includes('admin')) {
        return void res.status(403).json({ error: 'Platform admin role required' });
    }

    const inProject = getProjectUsers(projectId).some(u => u.id === userId);
    if (!inProject) {
        return void res.status(404).json({ error: 'User is not a member of this project' });
    }

    const body = req.body as Record<string, unknown>;
    const patch: OperatorUserPatch = {};
    if (typeof body.name === 'string') patch.name = body.name;
    if (typeof body.email === 'string') patch.email = body.email;
    if (typeof body.isActive === 'boolean') patch.isActive = body.isActive;
    if (Array.isArray(body.roles)) {
        patch.roles = body.roles.filter((r): r is string => typeof r === 'string');
    }
    if (typeof body.avatar === 'string') patch.avatar = body.avatar;

    if (Object.keys(patch).length === 0) {
        return void res.status(400).json({ error: 'No valid fields to update' });
    }

    try {
        const updated = updateUserAsOperator(userId, patch, actor);
        const online = new Set(getOnlineUserIdsForProject(projectId));
        return void res.json({
            user: toProjectUserDto(
                {
                    id: updated.id,
                    name: updated.name,
                    email: updated.email,
                    avatar: updated.avatar,
                    roles: updated.roles,
                    isActive: updated.isActive,
                    lastLoginAt: updated.lastLoginAt
                },
                online
            )
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('not found')) {
            return void res.status(404).json({ error: msg });
        }
        if (msg.includes('Email') || msg.includes('Admin')) {
            return void res.status(400).json({ error: msg });
        }
        return void sendApiError(res, req, err);
    }
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/users': {
        get: {
            summary: 'List users with access to a project',
            description:
                'JWT and project membership required. Each item includes `online` (Studio presence within `ONLINE_PRESENCE_MAX_IDLE_MS`, default 90s) and `lastLoginAt` (last sign-in). Omits `passwordHash`, `auth`, and `projects`.',
            tags: ['Users'],
            security: [{ bearerAuth: [] }],
            parameters: [
                {
                    name: 'projectId',
                    in: 'path',
                    required: true,
                    schema: { type: 'string' }
                }
            ],
            responses: {
                '200': {
                    description: 'List of project members',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['users'],
                                properties: {
                                    users: {
                                        type: 'array',
                                        items: { $ref: '#/components/schemas/ProjectMemberUser' }
                                    }
                                }
                            }
                        }
                    }
                },
                '400': {
                    description: 'Missing project ID',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                },
                '401': { description: 'Unauthorized' },
                '403': { description: 'Forbidden (no access to project)' },
                '500': {
                    description: 'Internal server error'
                }
            }
        }
    },
    '/projects/{projectId}/users/{userId}': {
        patch: {
            summary: 'Update a project member (platform operator only)',
            description:
                'Requires JWT, access to the project, and the platform operator role (`admin`, see `OPERATOR_ROLE_SLUG`). The target user must already belong to the project.',
            tags: ['Users'],
            security: [{ bearerAuth: [] }],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'userId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/ProjectMemberPatchBody' }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Updated member (same shape as list items)',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['user'],
                                properties: {
                                    user: { $ref: '#/components/schemas/ProjectMemberUser' }
                                }
                            }
                        }
                    }
                },
                '400': {
                    description: 'Invalid body, duplicate email, or empty patch',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                },
                '401': { description: 'Unauthorized' },
                '403': { description: 'Not a platform operator' },
                '404': {
                    description: 'User not in project or not found',
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
