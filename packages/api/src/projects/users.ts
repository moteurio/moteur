import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import { hasRole, normalizeStoredRoles } from '@moteurio/types';
import { requireProjectAccess } from '../middlewares/auth.js';
import {
    getProjectUsers,
    updateUserAsOperator,
    type OperatorUserPatch
} from '@moteurio/core/users.js';
import { getProject, updateProject } from '@moteurio/core/projects.js';
import { sendApiError } from '../utils/apiError.js';
import { getOnlineUserIdsForProject } from '@moteurio/core';

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
    const { projectId } = req.params as Record<string, string>;

    if (!projectId) {
        return void res.status(400).json({ error: 'Missing projectId' });
    }

    try {
        const online = new Set(getOnlineUserIdsForProject(projectId));
        const users = getProjectUsers(projectId, req.project).map(u =>
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

router.patch(
    '/:projectId/users/:userId',
    requireProjectAccess,
    async (req: Request, res: Response) => {
        const { projectId, userId } = req.params as Record<string, string>;
        const actor = req.user;
        const account = req.account;

        if (!projectId || !userId) {
            return void res.status(400).json({ error: 'Missing projectId or userId' });
        }

        const body = (req.body ?? {}) as Record<string, unknown>;
        const roles = Array.isArray(body.roles)
            ? normalizeStoredRoles(body.roles.filter((r): r is string => typeof r === 'string'))
            : undefined;
        const patch: OperatorUserPatch = {};
        if (typeof body.name === 'string') patch.name = body.name;
        if (typeof body.email === 'string') patch.email = body.email;
        if (typeof body.isActive === 'boolean') patch.isActive = body.isActive;
        if (typeof body.avatar === 'string') patch.avatar = body.avatar;

        if (!roles && Object.keys(patch).length === 0) {
            return void res.status(400).json({ error: 'No valid fields to update' });
        }
        if (roles && !hasRole(actor, 'admin')) {
            return void res.status(403).json({ error: 'Project admin role required' });
        }
        if (Object.keys(patch).length > 0 && !hasRole(account, 'admin')) {
            return void res.status(403).json({ error: 'Platform operator role required' });
        }

        if (!getProjectUsers(projectId).some(u => u.id === userId)) {
            return void res.status(404).json({ error: 'User is not a member of this project' });
        }

        try {
            let project = await getProject(account!, projectId);
            const memberRoles = roles ? { ...project.memberRoles, [userId]: roles } : undefined;
            if (
                memberRoles &&
                !getProjectUsers(projectId, { memberRoles }).some(u => hasRole(u, 'admin'))
            ) {
                return void res.status(400).json({ error: 'A project needs at least one admin' });
            }

            if (Object.keys(patch).length > 0) updateUserAsOperator(userId, patch, account!);
            if (memberRoles) project = await updateProject(account!, projectId, { memberRoles });

            const member = getProjectUsers(projectId, project).find(u => u.id === userId);
            if (!member) {
                return void res.status(404).json({ error: `User not found: ${userId}` });
            }
            const online = new Set(getOnlineUserIdsForProject(projectId));
            return void res.json({
                user: toProjectUserDto(
                    {
                        id: member.id,
                        name: member.name,
                        email: member.email,
                        avatar: member.avatar,
                        roles: member.roles,
                        isActive: member.isActive,
                        lastLoginAt: member.lastLoginAt
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
    }
);

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/users': {
        get: {
            summary: 'List users with access to a project',
            description:
                "JWT and project membership required. `roles` are the member's roles in this project. Each item includes `online` (Studio presence within `ONLINE_PRESENCE_MAX_IDLE_MS`, default 90s) and `lastLoginAt` (last sign-in). Omits `passwordHash`, `auth`, and `projects`.",
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
            summary: 'Update a project member',
            description:
                "`roles` sets the member's roles in this project only (stored in the project's `memberRoles`) and needs the Admin role in this project; the project must keep at least one admin. `name`, `email`, `isActive` and `avatar` change the account itself and need the platform operator role (`OPERATOR_ROLE_SLUG` in account roles). The target user must already belong to the project.",
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
                    description: 'Invalid body, duplicate email, empty patch, or no admin left',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                },
                '401': { description: 'Unauthorized' },
                '403': {
                    description: 'Not a project admin (roles) or platform operator (account fields)'
                },
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
