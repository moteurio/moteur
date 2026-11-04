/**
 * Workspaces: the teams that own projects (see `Workspace` in @moteurio/types). Everyone signed in
 * sees the workspaces they are a member of; someone outside one is told it doesn't exist.
 */
import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import { WORKSPACE_ROLES, type Workspace } from '@moteurio/types/Workspace.js';
import {
    assertManagesWorkspace,
    cleanMemberInput,
    createWorkspace,
    deleteWorkspace,
    getWorkspace,
    projectsInWorkspace,
    removeWorkspaceMember,
    renameWorkspace,
    updateWorkspaceMember,
    workspacesOf,
    type MemberInput
} from '@moteurio/core/workspaces.js';
import {
    cleanInviteNote,
    createWorkspaceInvite,
    INVITE_NOTE_MAX,
    INVITE_TTL_DAYS,
    listWorkspaceInvites,
    normalizeInviteEmail,
    renewWorkspaceInvite,
    revokeWorkspaceInvite,
    type WorkspaceInvite
} from '@moteurio/core/invites.js';
import { getUserByEmail, getUserById } from '@moteurio/core/users.js';
import { readerOf, renderEmail } from '@moteurio/core/email/render.js';
import { emailUnavailable, sendEmail } from '@moteurio/core/emailNotifier.js';
import { requireAuth } from '../middlewares/auth.js';
import { sendApiError } from '../utils/apiError.js';
import { studioOrigin } from '../utils/studioOrigin.js';

const router: Router = Router();
router.use(requireAuth);

const NOT_FOUND = (id: string) => ({
    error: `Workspace "${id}" not found.`,
    code: 'WORKSPACE_NOT_FOUND'
});

/** The workspace, when the caller is in it; else a 404 is sent and undefined returned. */
function theirs(req: Request, res: Response): Workspace | undefined {
    const { workspaceId } = req.params as Record<string, string>;
    const workspace = getWorkspace(workspaceId);
    if (!workspace?.members?.[req.user!.id]) {
        res.status(404).json(NOT_FOUND(workspaceId ?? ''));
        return undefined;
    }
    return workspace;
}

/** Owners and admins only; else a 403 is sent and false returned. */
function manages(req: Request, res: Response, workspace: Workspace): boolean {
    try {
        assertManagesWorkspace(workspace, req.user!.id);
        return true;
    } catch (err) {
        sendApiError(res, req, err);
        return false;
    }
}

function summary(workspace: Workspace, userId: string) {
    const you = workspace.members[userId];
    return {
        id: workspace.id,
        name: workspace.name,
        personal: !!workspace.personal,
        createdAt: workspace.createdAt,
        role: you?.role,
        ...(you?.role === 'member' && { access: you.access ?? 'chosen' }),
        members: Object.keys(workspace.members).length,
        projects: projectsInWorkspace(workspace.id).length
    };
}

function detail(workspace: Workspace, userId: string) {
    return {
        ...summary(workspace, userId),
        people: Object.entries(workspace.members).map(([id, m]) => {
            const user = getUserById(id);
            return {
                id,
                name: user?.name,
                email: user?.email,
                avatar: user?.avatar,
                role: m.role,
                ...(m.role === 'member' && { access: m.access ?? 'chosen' }),
                ...(m.projectRoles && { projectRoles: m.projectRoles }),
                joinedAt: m.joinedAt
            };
        })
    };
}

function memberInput(body: Record<string, unknown>): MemberInput {
    return {
        role: body.role as MemberInput['role'],
        ...(body.access !== undefined && { access: body.access as MemberInput['access'] }),
        ...(Array.isArray(body.projectRoles) && {
            projectRoles: body.projectRoles.filter((r): r is string => typeof r === 'string')
        })
    };
}

router.get('/', (req: Request, res: Response) => {
    try {
        const id = req.user!.id;
        res.json({ workspaces: workspacesOf(id).map(w => summary(w, id)) });
    } catch (err) {
        sendApiError(res, req, err);
    }
});

router.post('/', async (req: Request, res: Response) => {
    try {
        const workspace = await createWorkspace(req.user!, (req.body ?? {}).name);
        res.status(201).json({ workspace: detail(workspace, req.user!.id) });
    } catch (err) {
        sendApiError(res, req, err);
    }
});

router.get('/:workspaceId', (req: Request, res: Response) => {
    const workspace = theirs(req, res);
    if (workspace) res.json({ workspace: detail(workspace, req.user!.id) });
});

router.patch('/:workspaceId', async (req: Request, res: Response) => {
    const workspace = theirs(req, res);
    if (!workspace) return;
    try {
        const renamed = await renameWorkspace(req.user!, workspace.id, (req.body ?? {}).name);
        res.json({ workspace: detail(renamed, req.user!.id) });
    } catch (err) {
        sendApiError(res, req, err);
    }
});

router.delete('/:workspaceId', async (req: Request, res: Response) => {
    const workspace = theirs(req, res);
    if (!workspace) return;
    try {
        await deleteWorkspace(req.user!, workspace.id);
        res.status(204).end();
    } catch (err) {
        sendApiError(res, req, err);
    }
});

router.patch('/:workspaceId/members/:userId', async (req: Request, res: Response) => {
    const workspace = theirs(req, res);
    if (!workspace) return;
    const { userId } = req.params as Record<string, string>;
    try {
        const updated = await updateWorkspaceMember(
            req.user!,
            workspace.id,
            userId!,
            memberInput((req.body ?? {}) as Record<string, unknown>)
        );
        res.json({ workspace: detail(updated, req.user!.id) });
    } catch (err) {
        sendApiError(res, req, err);
    }
});

router.delete('/:workspaceId/members/:userId', async (req: Request, res: Response) => {
    const workspace = theirs(req, res);
    if (!workspace) return;
    const { userId } = req.params as Record<string, string>;
    try {
        await removeWorkspaceMember(req.user!, workspace.id, userId!);
        res.status(204).end();
    } catch (err) {
        sendApiError(res, req, err);
    }
});

function inviteDto(invite: WorkspaceInvite) {
    const by = getUserById(invite.invitedBy);
    return {
        id: invite.id,
        email: invite.email,
        role: invite.member.role,
        ...(invite.member.access && { access: invite.member.access }),
        ...(invite.member.projectRoles && { projectRoles: invite.member.projectRoles }),
        invitedBy: { id: invite.invitedBy, name: by?.name ?? by?.email },
        ...(invite.note && { note: invite.note }),
        createdAt: invite.createdAt,
        expiresAt: invite.expiresAt
    };
}

/** Send the link if the server can; says why not otherwise. Never throws. */
async function deliver(
    req: Request,
    workspace: Workspace,
    invite: WorkspaceInvite,
    token: string
): Promise<{ path: string; url: string | null; emailed: boolean; emailError?: string }> {
    const path = `/invite/${token}`;
    const origin = studioOrigin(req.body?.appUrl);
    const url = origin ? `${origin}${path}` : null;
    if (!url)
        return {
            path,
            url,
            emailed: false,
            emailError: 'No Studio address to link to (STUDIO_URL).'
        };
    const unavailable = emailUnavailable();
    if (unavailable) return { path, url, emailed: false, emailError: unavailable };
    const inviter = getUserById(req.user!.id);
    const known = getUserByEmail(invite.email);
    const locale =
        readerOf(known).locale ??
        (typeof req.body?.locale === 'string' ? req.body.locale.slice(0, 20) : undefined) ??
        readerOf(inviter).locale;
    try {
        const email = renderEmail(
            'invite',
            {
                email: invite.email,
                inviter: inviter?.name || inviter?.email || 'Someone',
                inviterEmail: inviter?.email || undefined,
                project: workspace.name,
                team: { role: invite.member.role, access: invite.member.access },
                note: invite.note,
                url,
                days: INVITE_TTL_DAYS,
                expiresAt: invite.expiresAt,
                replyToInviter: Boolean(inviter?.email)
            },
            { locale, look: readerOf(known).look }
        );
        await sendEmail({
            to: [invite.email],
            subject: email.subject,
            text: email.text,
            html: email.html,
            attachments: email.attachments,
            category: 'auth',
            ...(inviter?.email ? { replyTo: inviter.email } : {})
        });
        return { path, url, emailed: true };
    } catch (err) {
        return {
            path,
            url,
            emailed: false,
            emailError: err instanceof Error ? err.message : String(err)
        };
    }
}

router.get('/:workspaceId/invites', (req: Request, res: Response) => {
    const workspace = theirs(req, res);
    if (!workspace || !manages(req, res, workspace)) return;
    res.json({ invites: listWorkspaceInvites(workspace.id).map(inviteDto) });
});

router.post('/:workspaceId/invites', async (req: Request, res: Response) => {
    const workspace = theirs(req, res);
    if (!workspace) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.email !== 'string' || !body.email.trim())
        return void res.status(400).json({ error: 'email is required' });
    try {
        const member = cleanMemberInput(memberInput(body));
        // Only owners invite owners.
        assertManagesWorkspace(workspace, req.user!.id, member.role);
        const note = cleanInviteNote(body.note);
        const email = normalizeInviteEmail(body.email);
        const already = Object.keys(workspace.members).some(
            id => getUserById(id)?.email?.toLowerCase() === email
        );
        if (already)
            return void res.status(409).json({ error: 'Already a member of this workspace' });
        const { invite, token } = createWorkspaceInvite({
            workspaceId: workspace.id,
            email,
            member,
            invitedBy: req.user!.id,
            note
        });
        const sent = await deliver(req, workspace, invite, token);
        res.status(201).json({ invite: inviteDto(invite), ...sent });
    } catch (err) {
        if (err instanceof Error && err.message === 'A valid email is required')
            return void res.status(400).json({ error: err.message });
        sendApiError(res, req, err);
    }
});

router.post('/:workspaceId/invites/:inviteId/resend', async (req: Request, res: Response) => {
    const workspace = theirs(req, res);
    if (!workspace || !manages(req, res, workspace)) return;
    const { inviteId } = req.params as Record<string, string>;
    try {
        const renewed = renewWorkspaceInvite(workspace.id, inviteId!);
        if (!renewed) return void res.status(404).json({ error: 'Invite not found' });
        const sent = await deliver(req, workspace, renewed.invite, renewed.token);
        res.json({ invite: inviteDto(renewed.invite), ...sent });
    } catch (err) {
        sendApiError(res, req, err);
    }
});

router.delete('/:workspaceId/invites/:inviteId', (req: Request, res: Response) => {
    const workspace = theirs(req, res);
    if (!workspace || !manages(req, res, workspace)) return;
    const { inviteId } = req.params as Record<string, string>;
    if (!revokeWorkspaceInvite(workspace.id, inviteId!))
        return void res.status(404).json({ error: 'Invite not found' });
    res.status(204).end();
});

const wsParam: OpenAPIV3.ParameterObject = {
    name: 'workspaceId',
    in: 'path',
    required: true,
    schema: { type: 'string' }
};
const userParam: OpenAPIV3.ParameterObject = {
    name: 'userId',
    in: 'path',
    required: true,
    schema: { type: 'string' }
};
const inviteParam: OpenAPIV3.ParameterObject = {
    name: 'inviteId',
    in: 'path',
    required: true,
    schema: { type: 'string' }
};
const json = (schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject) => ({
    'application/json': { schema }
});
const one = json({
    type: 'object',
    required: ['workspace'],
    properties: { workspace: { $ref: '#/components/schemas/Workspace' } }
});
const sec = [{ bearerAuth: [] }];
const tags = ['Workspaces'];
const notFound = { description: 'Not a workspace you are in (`WORKSPACE_NOT_FOUND`)' };
const memberBody: OpenAPIV3.SchemaObject = {
    type: 'object',
    required: ['role'],
    properties: {
        role: { type: 'string', enum: [...WORKSPACE_ROLES] },
        access: {
            type: 'string',
            enum: ['all', 'chosen'],
            description:
                'Members only: every project of the workspace, or only those they are added to. Default `chosen`.'
        },
        projectRoles: {
            type: 'array',
            items: { type: 'string' },
            description:
                'Members with `access: all`: their roles in every project (Writer when none).'
        }
    }
};
const sentSchema: OpenAPIV3.SchemaObject = {
    type: 'object',
    required: ['invite', 'path', 'emailed'],
    properties: {
        invite: { $ref: '#/components/schemas/WorkspaceInvite' },
        path: { type: 'string', description: 'Studio path of the link, `/invite/<token>`.' },
        url: { type: 'string', nullable: true },
        emailed: { type: 'boolean' },
        emailError: { type: 'string', description: 'Why the email did not go out.' }
    }
};

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/workspaces': {
        get: {
            summary: 'List your workspaces',
            description:
                'The workspaces you are a member of, with your `role` (and `access`, for a Member). Projects you are only a guest in are not workspaces of yours.',
            tags,
            security: sec,
            responses: {
                '200': {
                    description: 'Your workspaces',
                    content: json({
                        type: 'object',
                        properties: {
                            workspaces: {
                                type: 'array',
                                items: { $ref: '#/components/schemas/WorkspaceSummary' }
                            }
                        }
                    })
                }
            }
        },
        post: {
            summary: 'Start a workspace',
            description: 'Body `{ name }`. You are its owner.',
            tags,
            security: sec,
            requestBody: {
                required: true,
                content: json({
                    type: 'object',
                    required: ['name'],
                    properties: { name: { type: 'string', maxLength: 120 } }
                })
            },
            responses: {
                '201': { description: 'Started', content: one },
                '400': { description: 'No name (`WORKSPACE_NAME`)' }
            }
        }
    },
    '/workspaces/{workspaceId}': {
        get: {
            summary: 'Get a workspace and its people',
            tags,
            security: sec,
            parameters: [wsParam],
            responses: { '200': { description: 'The workspace', content: one }, '404': notFound }
        },
        patch: {
            summary: 'Rename a workspace',
            description: 'Body `{ name }`. Owners and admins.',
            tags,
            security: sec,
            parameters: [wsParam],
            requestBody: {
                required: true,
                content: json({
                    type: 'object',
                    required: ['name'],
                    properties: { name: { type: 'string', maxLength: 120 } }
                })
            },
            responses: {
                '200': { description: 'Renamed', content: one },
                '400': { description: 'No name' },
                '403': { description: 'Not an owner or admin' },
                '404': notFound
            }
        },
        delete: {
            summary: 'Delete a workspace',
            description:
                'Owners only, once it has no projects (move or delete them first). Its pending invites are withdrawn.',
            tags,
            security: sec,
            parameters: [wsParam],
            responses: {
                '204': { description: 'Deleted' },
                '403': { description: 'Not an owner' },
                '404': notFound,
                '409': { description: 'It still has projects (`WORKSPACE_NOT_EMPTY`)' }
            }
        }
    },
    '/workspaces/{workspaceId}/members/{userId}': {
        patch: {
            summary: 'Change a member’s place',
            description:
                'Owners and admins; only owners make, change or demote owners. A workspace always keeps an owner (409 `LAST_OWNER`).',
            tags,
            security: sec,
            parameters: [wsParam, userParam],
            requestBody: { required: true, content: json(memberBody) },
            responses: {
                '200': { description: 'Changed', content: one },
                '400': { description: 'Unknown role or access' },
                '403': { description: 'Not allowed to make this change' },
                '404': { description: 'No such workspace, or not a member of it' },
                '409': { description: 'It would leave no owner (`LAST_OWNER`)' }
            }
        },
        delete: {
            summary: 'Take someone out of a workspace, or leave it',
            description:
                'Owners and admins, or anyone for themselves. They leave every project of the workspace too, even those they were added to one by one. A workspace always keeps an owner (409 `LAST_OWNER`).',
            tags,
            security: sec,
            parameters: [wsParam, userParam],
            responses: {
                '204': { description: 'Out' },
                '403': { description: 'Not allowed' },
                '404': { description: 'No such workspace, or not a member of it' },
                '409': { description: 'The last owner (`LAST_OWNER`)' }
            }
        }
    },
    '/workspaces/{workspaceId}/invites': {
        get: {
            summary: 'List pending workspace invites',
            description: 'Owners and admins.',
            tags,
            security: sec,
            parameters: [wsParam],
            responses: {
                '200': {
                    description: 'Pending invites',
                    content: json({
                        type: 'object',
                        properties: {
                            invites: {
                                type: 'array',
                                items: { $ref: '#/components/schemas/WorkspaceInvite' }
                            }
                        }
                    })
                },
                '403': { description: 'Not an owner or admin' },
                '404': notFound
            }
        },
        post: {
            summary: 'Invite someone into the workspace',
            description: `Owners and admins; only owners invite owners. Emails a link valid for ${INVITE_TTL_DAYS} days when SMTP is set up; the link is also returned once. The same link format as project invites (\`/invite/<token>\`).`,
            tags,
            security: sec,
            parameters: [wsParam],
            requestBody: {
                required: true,
                content: json({
                    ...memberBody,
                    required: ['email', 'role'],
                    properties: {
                        email: { type: 'string', format: 'email' },
                        ...memberBody.properties,
                        note: { type: 'string', maxLength: INVITE_NOTE_MAX },
                        appUrl: { type: 'string' },
                        locale: { type: 'string' }
                    }
                })
            },
            responses: {
                '201': { description: 'Invited', content: json(sentSchema) },
                '400': { description: 'Missing or invalid email, role or note' },
                '403': { description: 'Not allowed to invite with this role' },
                '404': notFound,
                '409': { description: 'Already a member' }
            }
        }
    },
    '/workspaces/{workspaceId}/invites/{inviteId}/resend': {
        post: {
            summary: 'Send a pending workspace invite again',
            description: 'A new link and a new expiry; the previous link stops working.',
            tags,
            security: sec,
            parameters: [wsParam, inviteParam],
            responses: {
                '200': { description: 'Sent again', content: json(sentSchema) },
                '404': { description: 'No such pending invite' }
            }
        }
    },
    '/workspaces/{workspaceId}/invites/{inviteId}': {
        delete: {
            summary: 'Withdraw a workspace invite',
            tags,
            security: sec,
            parameters: [wsParam, inviteParam],
            responses: {
                '204': { description: 'Withdrawn' },
                '404': { description: 'No such pending invite' }
            }
        }
    }
};

const role: OpenAPIV3.SchemaObject = { type: 'string', enum: [...WORKSPACE_ROLES] };
const summarySchema: OpenAPIV3.SchemaObject = {
    type: 'object',
    required: ['id', 'name', 'personal', 'createdAt', 'members', 'projects'],
    properties: {
        id: { type: 'string', example: 'ws_a1b2c3' },
        name: { type: 'string' },
        personal: { type: 'boolean', description: 'Someone’s own workspace.' },
        createdAt: { type: 'string', format: 'date-time' },
        role: { ...role, description: 'Your role in it.' },
        access: { type: 'string', enum: ['all', 'chosen'], description: 'Yours, as a Member.' },
        members: { type: 'integer', description: 'How many people are in it.' },
        projects: { type: 'integer', description: 'How many projects it has.' }
    }
};

export const schemas: OpenAPIV3.ComponentsObject['schemas'] = {
    WorkspaceSummary: summarySchema,
    Workspace: {
        allOf: [
            { $ref: '#/components/schemas/WorkspaceSummary' },
            {
                type: 'object',
                required: ['people'],
                properties: {
                    people: {
                        type: 'array',
                        items: {
                            type: 'object',
                            required: ['id', 'role', 'joinedAt'],
                            properties: {
                                id: { type: 'string' },
                                name: { type: 'string' },
                                email: { type: 'string' },
                                avatar: { type: 'string' },
                                role,
                                access: { type: 'string', enum: ['all', 'chosen'] },
                                projectRoles: { type: 'array', items: { type: 'string' } },
                                joinedAt: { type: 'string', format: 'date-time' }
                            }
                        }
                    }
                }
            }
        ]
    },
    WorkspaceInvite: {
        type: 'object',
        required: ['id', 'email', 'role', 'createdAt', 'expiresAt'],
        properties: {
            id: { type: 'string' },
            email: { type: 'string' },
            role,
            access: { type: 'string', enum: ['all', 'chosen'] },
            projectRoles: { type: 'array', items: { type: 'string' } },
            invitedBy: {
                type: 'object',
                properties: { id: { type: 'string' }, name: { type: 'string' } }
            },
            note: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            expiresAt: { type: 'string', format: 'date-time' }
        }
    }
};

export default router;
