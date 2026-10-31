import type { Request, Response } from 'express';
import { Router } from 'express';
import { randomUUID } from 'crypto';
import type { OpenAPIV3 } from 'openapi-types';
import { consumeInvite, findInviteByToken } from '@moteurio/core/invites.js';
import {
    createUser,
    getUserByEmail,
    getUserById,
    listUsers,
    recordUserLogin,
    reloadUsers
} from '@moteurio/core/users.js';
import { addProjectMember, getProjectById, getProjectIdsForUser } from '@moteurio/core/projects.js';
import { generateJWT, hashPassword, passwordProblem } from '@moteurio/core/auth.js';
import { assertPeopleRoom } from '@moteurio/core/planLimits.js';
import { requireAuth } from '../middlewares/auth.js';
import { sendApiError } from '../utils/apiError.js';

const router: Router = Router();

const GONE = { error: 'This invite has expired, was withdrawn, or was already used.' };

/** `email` is lowercased; stored addresses may not be. */
function findAccount(email: string) {
    reloadUsers();
    return getUserByEmail(email) ?? listUsers().find(u => u.email.toLowerCase() === email);
}

router.get('/:token', async (req: Request, res: Response) => {
    const { token } = req.params as Record<string, string>;
    const invite = findInviteByToken(token);
    if (!invite) return void res.status(404).json(GONE);
    try {
        const project = await getProjectById(invite.projectId);
        if (!project) return void res.status(404).json(GONE);
        const by = getUserById(invite.invitedBy);
        const account = findAccount(invite.email);
        return void res.json({
            email: invite.email,
            roles: invite.roles,
            expiresAt: invite.expiresAt,
            project: { id: project.id, label: project.label || project.id },
            invitedBy: { name: by?.name ?? by?.email },
            hasAccount: !!account,
            // An account made with an email code has none: that person signs in by email.
            hasPassword: !!account?.passwordHash
        });
    } catch (err) {
        return void sendApiError(res, req, err);
    }
});

/** Signed in with the invited address: join the project. */
router.post('/:token/accept', requireAuth, async (req: Request, res: Response) => {
    const { token } = req.params as Record<string, string>;
    const invite = findInviteByToken(token);
    if (!invite) return void res.status(404).json(GONE);
    const user = req.user!;
    if (user.email.toLowerCase() !== invite.email) {
        return void res.status(403).json({
            error: `This invite is for ${invite.email}. Sign in with that address to accept it.`,
            code: 'email_mismatch'
        });
    }
    try {
        const project = await getProjectById(invite.projectId);
        if (!project) return void res.status(404).json(GONE);
        // An existing member keeps the roles they have.
        if (!project.users?.includes(user.id)) {
            await addProjectMember(invite.projectId, user, invite.roles);
        }
        consumeInvite(invite.id);
        return void res.json({ projectId: invite.projectId });
    } catch (err) {
        return void sendApiError(res, req, err);
    }
});

/** No account yet: create one with the invited address (the link proves it) and join. */
router.post('/:token/register', async (req: Request, res: Response) => {
    const { token } = req.params as Record<string, string>;
    const invite = findInviteByToken(token);
    if (!invite) return void res.status(404).json(GONE);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!name || name.length > 120) {
        return void res.status(400).json({ error: 'A name is required', code: 'name' });
    }
    // No password: the account is like one made with an email code (one can be added later).
    const weak = password ? passwordProblem(password) : null;
    if (weak) return void res.status(400).json({ error: weak, code: 'password' });
    if (findAccount(invite.email)) {
        return void res.status(409).json({
            error: 'There is already an account with this address. Sign in to accept.',
            code: 'account_exists'
        });
    }
    try {
        const project = await getProjectById(invite.projectId);
        if (!project) return void res.status(404).json(GONE);
        assertPeopleRoom(invite.projectId, project.users?.length ?? 0);
        const user = await createUser({
            id: `user:${randomUUID()}`,
            isActive: true,
            email: invite.email,
            name,
            ...(password && { passwordHash: await hashPassword(password) }),
            roles: [],
            projects: [],
            signup: { at: new Date().toISOString(), method: 'invite' },
            // Invited to a project: the welcome screens have nothing to ask.
            onboarding: { intent: 'team', finishedAt: new Date().toISOString() }
        });
        await addProjectMember(invite.projectId, user, invite.roles);
        consumeInvite(invite.id);
        const loginAt = await recordUserLogin(user.id);
        const signedIn = {
            ...user,
            ...(loginAt ? { lastLoginAt: loginAt } : {}),
            projects: getProjectIdsForUser(user.id)
        };
        return void res.status(201).json({
            token: generateJWT(signedIn),
            user: {
                id: signedIn.id,
                email: signedIn.email,
                name: signedIn.name,
                roles: signedIn.roles,
                projects: signedIn.projects,
                isActive: signedIn.isActive
            },
            projectId: invite.projectId
        });
    } catch (err) {
        return void sendApiError(res, req, err);
    }
});

const tokenParam: OpenAPIV3.ParameterObject = {
    name: 'token',
    in: 'path',
    required: true,
    schema: { type: 'string' },
    description: 'The token from the invite link (`/invite/<token>`).'
};

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/invites/{token}': {
        get: {
            summary: 'Look up an invite',
            description:
                'No auth: the link is the credential. Says which project, who invited, for which address, whether that address has an account (to offer signing in or creating one), and whether that account has a password (an account made with an email code has none, so its owner signs in by email).',
            tags: ['Users'],
            parameters: [tokenParam],
            responses: {
                '200': {
                    description: 'The invite',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    email: { type: 'string' },
                                    roles: { type: 'array', items: { type: 'string' } },
                                    expiresAt: { type: 'string', format: 'date-time' },
                                    project: {
                                        type: 'object',
                                        properties: {
                                            id: { type: 'string' },
                                            label: { type: 'string' }
                                        }
                                    },
                                    invitedBy: {
                                        type: 'object',
                                        properties: { name: { type: 'string' } }
                                    },
                                    hasAccount: { type: 'boolean' },
                                    hasPassword: {
                                        type: 'boolean',
                                        description:
                                            'True only when the address has an account and that account has a password'
                                    }
                                }
                            }
                        }
                    }
                },
                '404': { description: 'Unknown, expired, withdrawn or used' }
            }
        }
    },
    '/invites/{token}/accept': {
        post: {
            summary: 'Accept an invite',
            description:
                'Signed in with the invited address. Joins the project with the invited roles; someone already a member keeps theirs.',
            tags: ['Users'],
            security: [{ bearerAuth: [] }],
            parameters: [tokenParam],
            responses: {
                '200': {
                    description: 'Joined',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: { projectId: { type: 'string' } }
                            }
                        }
                    }
                },
                '401': { description: 'Not signed in' },
                '402': { description: 'The project is full for its plan (`code: plan_limit`)' },
                '403': { description: 'Signed in with another address (`code: email_mismatch`)' },
                '404': { description: 'Unknown, expired, withdrawn or used' }
            }
        }
    },
    '/invites/{token}/register': {
        post: {
            summary: 'Create an account from an invite',
            description:
                'For an address with no account yet: creates it (the link proves the address), joins the project, and signs in. `password` is optional: without one, the account has no password, like one made with an email code. The person then signs in with a code or link by email (POST /auth/email/code).',
            tags: ['Users'],
            parameters: [tokenParam],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            required: ['name'],
                            properties: {
                                name: { type: 'string' },
                                password: {
                                    type: 'string',
                                    minLength: 8,
                                    description:
                                        'Optional. Left out (or empty), the account has no password and signs in by email.'
                                }
                            }
                        }
                    }
                }
            },
            responses: {
                '201': {
                    description: 'Signed in: `{ token, user, projectId }`',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    token: { type: 'string' },
                                    user: { type: 'object' },
                                    projectId: { type: 'string' }
                                }
                            }
                        }
                    }
                },
                '400': {
                    description:
                        'Missing name, or a password that is given is too weak (`code: name|password`)'
                },
                '402': {
                    description:
                        'The project is full for its plan (`code: plan_limit`); no account is created'
                },
                '404': { description: 'Unknown, expired, withdrawn or used' },
                '409': {
                    description: 'The address already has an account (`code: account_exists`)'
                }
            }
        }
    }
};

export default router;
