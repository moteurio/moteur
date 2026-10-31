import type { Request, Response } from 'express';
import { Router } from 'express';
import { URL } from 'url';
import type { OpenAPIV3 } from 'openapi-types';
import { hasRole } from '@moteurio/types';
import {
    createInvite,
    listInvites,
    normalizeInviteEmail,
    renewInvite,
    revokeInvite,
    INVITE_TTL_DAYS,
    type ProjectInvite
} from '@moteurio/core/invites.js';
import { getProjectUsers, getUserByEmail, getUserById } from '@moteurio/core/users.js';
import { readerOf, renderEmail } from '@moteurio/core/email/render.js';
import { emailUnavailable, sendEmail } from '@moteurio/core/emailNotifier.js';
import { assertPeopleRoom } from '@moteurio/core/planLimits.js';
import { requireProjectAdmin } from '../middlewares/auth.js';
import { sendApiError } from '../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

function allowedOrigins(): Set<string> {
    return new Set(
        [process.env.STUDIO_URL, process.env.CORS_ORIGINS]
            .flatMap(v => (v ?? '').split(','))
            .map(s => s.trim().replace(/\/$/, ''))
            .filter(Boolean)
    );
}

/** The Studio to link to: the caller's, when it is one we serve, else STUDIO_URL; null when unknown. */
function studioOrigin(appUrl: unknown): string | null {
    const allowed = allowedOrigins();
    if (typeof appUrl === 'string') {
        try {
            const origin = new URL(appUrl).origin;
            if (allowed.has(origin)) return origin;
        } catch {
            // fall through
        }
    }
    const configured = process.env.STUDIO_URL?.split(',')[0]?.trim().replace(/\/$/, '');
    return configured || null;
}

function toDto(invite: ProjectInvite) {
    const by = getUserById(invite.invitedBy);
    return {
        id: invite.id,
        email: invite.email,
        roles: invite.roles,
        invitedBy: { id: invite.invitedBy, name: by?.name ?? by?.email },
        createdAt: invite.createdAt,
        expiresAt: invite.expiresAt
    };
}

/** Send the link if the server can; says why not otherwise. Never throws. */
async function deliver(
    req: Request,
    invite: ProjectInvite,
    token: string
): Promise<{ path: string; url: string | null; emailed: boolean; emailError?: string }> {
    const path = `/invite/${token}`;
    const origin = studioOrigin(req.body?.appUrl);
    const url = origin ? `${origin}${path}` : null;
    if (!url) {
        return {
            path,
            url,
            emailed: false,
            emailError: 'No Studio address to link to (STUDIO_URL).'
        };
    }
    const unavailable = emailUnavailable();
    if (unavailable) return { path, url, emailed: false, emailError: unavailable };

    const inviter = req.account?.name || req.account?.email || 'Someone';
    const project = req.project?.label || invite.projectId;
    // Their language if they have an account, else the one the inviter asks for, else theirs.
    const known = getUserByEmail(invite.email);
    const locale =
        readerOf(known).locale ??
        (typeof req.body?.locale === 'string' ? req.body.locale.slice(0, 20) : undefined) ??
        readerOf(req.account).locale;
    try {
        const email = renderEmail(
            'invite',
            {
                email: invite.email,
                inviter,
                project,
                url,
                days: INVITE_TTL_DAYS,
                replyToInviter: Boolean(req.account?.email)
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
            ...(req.account?.email ? { replyTo: req.account.email } : {})
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

router.get('/:projectId/invites', requireProjectAdmin, (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    try {
        return void res.json({ invites: listInvites(projectId).map(toDto) });
    } catch (err) {
        return void sendApiError(res, req, err);
    }
});

router.post('/:projectId/invites', requireProjectAdmin, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.email !== 'string' || !body.email.trim()) {
        return void res.status(400).json({ error: 'email is required' });
    }
    const roles = Array.isArray(body.roles)
        ? body.roles.filter((r): r is string => typeof r === 'string')
        : [];
    // As for members (users.ts): Developer and Billing are given only by someone who has them.
    const withheld = (['developer', 'billing'] as const).find(
        role => roles.includes(role) && !hasRole(req.user, role)
    );
    if (withheld) {
        return void res
            .status(403)
            .json({ error: `Only someone with the ${withheld} role can give it.` });
    }
    const email = normalizeInviteEmail(body.email);
    const members = getProjectUsers(projectId);
    if (members.some(u => u.email.toLowerCase() === email)) {
        return void res.status(409).json({ error: 'Already a member of this project' });
    }
    try {
        const otherInvites = listInvites(projectId).filter(i => i.email !== email).length;
        assertPeopleRoom(projectId, members.length + otherInvites);
        const { invite, token } = createInvite({
            projectId,
            email,
            roles,
            invitedBy: req.account!.id
        });
        const sent = await deliver(req, invite, token);
        return void res.status(201).json({ invite: toDto(invite), ...sent });
    } catch (err) {
        if (err instanceof Error && err.message === 'A valid email is required') {
            return void res.status(400).json({ error: err.message });
        }
        return void sendApiError(res, req, err);
    }
});

router.post(
    '/:projectId/invites/:inviteId/resend',
    requireProjectAdmin,
    async (req: Request, res: Response) => {
        const { projectId, inviteId } = req.params as Record<string, string>;
        try {
            const renewed = renewInvite(projectId, inviteId);
            if (!renewed) return void res.status(404).json({ error: 'Invite not found' });
            const sent = await deliver(req, renewed.invite, renewed.token);
            return void res.json({ invite: toDto(renewed.invite), ...sent });
        } catch (err) {
            return void sendApiError(res, req, err);
        }
    }
);

router.delete(
    '/:projectId/invites/:inviteId',
    requireProjectAdmin,
    (req: Request, res: Response) => {
        const { projectId, inviteId } = req.params as Record<string, string>;
        try {
            if (!revokeInvite(projectId, inviteId)) {
                return void res.status(404).json({ error: 'Invite not found' });
            }
            return void res.status(204).end();
        } catch (err) {
            return void sendApiError(res, req, err);
        }
    }
);

const projectParam: OpenAPIV3.ParameterObject = {
    name: 'projectId',
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
const sentSchema: OpenAPIV3.SchemaObject = {
    type: 'object',
    required: ['invite', 'path', 'emailed'],
    properties: {
        invite: { $ref: '#/components/schemas/ProjectInvite' },
        path: { type: 'string', description: 'Studio path of the link, `/invite/<token>`.' },
        url: {
            type: 'string',
            nullable: true,
            description:
                'Full link: the Studio in `appUrl` when it is in `CORS_ORIGINS`/`STUDIO_URL`, else `STUDIO_URL`.'
        },
        emailed: { type: 'boolean' },
        emailError: { type: 'string', description: 'Why the email did not go out.' }
    }
};
const sendBody: OpenAPIV3.RequestBodyObject = {
    content: {
        'application/json': {
            schema: {
                type: 'object',
                properties: {
                    appUrl: {
                        type: 'string',
                        description: 'The Studio address to put in the link.'
                    },
                    locale: {
                        type: 'string',
                        description:
                            'The language of the email (`fr`, `en`…), when the invited person has no account yet.'
                    }
                }
            }
        }
    }
};

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/invites': {
        get: {
            summary: 'List pending invites',
            description: 'Project admins only. Expired and accepted invites are not listed.',
            tags: ['Users'],
            security: [{ bearerAuth: [] }],
            parameters: [projectParam],
            responses: {
                '200': {
                    description: 'Pending invites',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    invites: {
                                        type: 'array',
                                        items: { $ref: '#/components/schemas/ProjectInvite' }
                                    }
                                }
                            }
                        }
                    }
                },
                '403': { description: 'Not a project admin' }
            }
        },
        post: {
            summary: 'Invite someone to the project',
            description: `Project admins only. Emails a link valid for ${INVITE_TTL_DAYS} days when SMTP is set up; the link is also returned once, to share by hand. A pending invite to the same address is replaced. Only someone signed in with that address, or creating an account from the link, can accept.`,
            tags: ['Users'],
            security: [{ bearerAuth: [] }],
            parameters: [projectParam],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            required: ['email'],
                            properties: {
                                email: { type: 'string', format: 'email' },
                                roles: { type: 'array', items: { type: 'string' } },
                                appUrl: { type: 'string' },
                                locale: {
                                    type: 'string',
                                    description:
                                        'The language of the email (`fr`, `en`…), when the invited person has no account yet.'
                                }
                            }
                        }
                    }
                }
            },
            responses: {
                '201': {
                    description: 'Invited',
                    content: { 'application/json': { schema: sentSchema } }
                },
                '400': { description: 'Missing or invalid email' },
                '402': {
                    description:
                        'Members plus pending invites would go over the plan (`code: plan_limit`, `limit: people`, `max`)'
                },
                '403': { description: 'Not a project admin' },
                '409': { description: 'Already a member' }
            }
        }
    },
    '/projects/{projectId}/invites/{inviteId}/resend': {
        post: {
            summary: 'Send a pending invite again',
            description: 'A new link and a new expiry; the previous link stops working.',
            tags: ['Users'],
            security: [{ bearerAuth: [] }],
            parameters: [projectParam, inviteParam],
            requestBody: sendBody,
            responses: {
                '200': {
                    description: 'Sent again',
                    content: { 'application/json': { schema: sentSchema } }
                },
                '404': { description: 'No such pending invite' }
            }
        }
    },
    '/projects/{projectId}/invites/{inviteId}': {
        delete: {
            summary: 'Withdraw an invite',
            tags: ['Users'],
            security: [{ bearerAuth: [] }],
            parameters: [projectParam, inviteParam],
            responses: {
                '204': { description: 'Withdrawn' },
                '404': { description: 'No such pending invite' }
            }
        }
    }
};

export const schemas: OpenAPIV3.ComponentsObject['schemas'] = {
    ProjectInvite: {
        type: 'object',
        required: ['id', 'email', 'roles', 'createdAt', 'expiresAt'],
        properties: {
            id: { type: 'string' },
            email: { type: 'string' },
            roles: { type: 'array', items: { type: 'string' } },
            invitedBy: {
                type: 'object',
                properties: { id: { type: 'string' }, name: { type: 'string' } }
            },
            createdAt: { type: 'string', format: 'date-time' },
            expiresAt: { type: 'string', format: 'date-time' }
        }
    }
};

export default router;
