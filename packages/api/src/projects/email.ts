import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import {
    canEditProjectEmail,
    previewProjectEmail,
    projectEmailView,
    saveProjectEmail
} from '@moteurio/core/projectEmail.js';
import { getProject } from '@moteurio/core/projects.js';
import { requireProjectAccess } from '../middlewares/auth.js';
import { sendApiError } from '../utils/apiError.js';

/**
 * A project's own mail to its site's visitors (form confirmations and form emails): who it comes
 * from and how it looks. Every member can see it and preview it; admins, builders, developers
 * and content leads change it.
 */
const router: Router = Router({ mergeParams: true });

const isObject = (v: unknown): v is Record<string, unknown> =>
    Boolean(v) && typeof v === 'object' && !Array.isArray(v);

router.get('/:projectId/email', requireProjectAccess, async (req: Request, res: Response) => {
    try {
        return void res.json(await projectEmailView(req.project!, canEditProjectEmail(req.user)));
    } catch (err) {
        return void sendApiError(res, req, err);
    }
});

router.patch('/:projectId/email', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    if (!canEditProjectEmail(req.user))
        return void res.status(403).json({
            error: 'Only an admin, a builder, a developer or a content lead can change the project’s emails'
        });
    if (!isObject(req.body))
        return void res.status(400).json({ error: 'Body must be an object of email settings' });
    try {
        await saveProjectEmail(req.user!, projectId, req.body);
        return void res.json(await projectEmailView(await getProject(req.user!, projectId), true));
    } catch (err) {
        return void sendApiError(res, req, err);
    }
});

router.post(
    '/:projectId/email/preview',
    requireProjectAccess,
    async (req: Request, res: Response) => {
        const body = isObject(req.body) ? req.body : {};
        try {
            return void res.json(
                await previewProjectEmail(req.project!, {
                    kind: body.kind,
                    locale: body.locale,
                    draft: body.settings
                })
            );
        } catch (err) {
            return void sendApiError(res, req, err);
        }
    }
);

const str: OpenAPIV3.SchemaObject = { type: 'string' };
const settingsSchema: OpenAPIV3.SchemaObject = {
    type: 'object',
    properties: {
        senderName: {
            ...str,
            maxLength: 80,
            description: 'The name inboxes show (default: the project’s name)'
        },
        replyTo: {
            ...str,
            format: 'email',
            description: 'Where replies go: the project’s contact address'
        },
        fromAddress: {
            ...str,
            format: 'email',
            description:
                'A From address on a domain the server allows (`sendingDomains`); else the server’s own address is used'
        },
        logoAssetId: {
            ...str,
            description: 'An image from the project’s media: PNG, JPEG or GIF, 100 KB at most'
        },
        logoUrl: { ...str, description: 'An https image, when the logo is not in the media' },
        logoWidth: { type: 'integer', minimum: 24, maximum: 300 },
        accent: {
            ...str,
            description: '#RRGGBB for buttons and links; white text on it must read at 4.5:1'
        },
        footer: {
            ...str,
            maxLength: 400,
            description: 'The business’s postal address or legal line; line breaks are kept'
        },
        siteUrl: { ...str, description: 'The site linked at the foot (default: the project’s)' }
    }
};
const viewSchema: OpenAPIV3.SchemaObject = {
    type: 'object',
    properties: {
        settings: { ...settingsSchema, description: 'What the project stored' },
        effective: {
            type: 'object',
            description: 'What the emails use, defaults filled in',
            properties: {
                senderName: str,
                from: { ...str, description: 'The From header, as it goes out' },
                fromAddress: str,
                replyTo: str,
                accent: str,
                footer: str,
                siteUrl: str,
                logo: {
                    type: 'object',
                    properties: {
                        src: { ...str, description: 'The image URL, or the image itself (data:)' },
                        width: { type: 'integer' }
                    }
                }
            }
        },
        sendingDomains: {
            type: 'array',
            items: str,
            description: 'Domains a project may send From; empty: only the server’s address'
        },
        credit: {
            ...str,
            nullable: true,
            description: 'The “Sent with …” line the server adds at the foot, or null'
        },
        canEdit: {
            type: 'boolean',
            description:
                'Whether the caller may change them (admins, builders, developers, content leads)'
        }
    }
};
const json = (schema: OpenAPIV3.SchemaObject) => ({ content: { 'application/json': { schema } } });
const projectParam: OpenAPIV3.ParameterObject = {
    name: 'projectId',
    in: 'path',
    required: true,
    schema: str
};
const denied = {
    '401': { description: 'Not signed in' },
    '403': {
        description:
            'Not a member of this project (or, to change them, not an admin, builder, developer or content lead)'
    }
};

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/email': {
        get: {
            summary: 'The project’s own mail: who it comes from and how it looks',
            description:
                'Form confirmations and form emails go to the site’s visitors under the project’s name, logo, colour and foot. Any member can read them.',
            tags: ['Projects'],
            parameters: [projectParam],
            responses: {
                '200': {
                    description: '`{ settings, effective, sendingDomains, credit, canEdit }`',
                    ...json(viewSchema)
                },
                ...denied
            }
        },
        patch: {
            summary: 'Change the project’s own mail',
            description:
                'Admins, builders, developers and content leads. Any of the settings; null or an empty string clears one. Setting `logoAssetId` clears `logoUrl`, and the other way round.',
            tags: ['Projects'],
            parameters: [projectParam],
            requestBody: { required: true, ...json(settingsSchema) },
            responses: {
                '200': {
                    description: '`{ settings, effective, sendingDomains, credit, canEdit }`',
                    ...json(viewSchema)
                },
                '400': { description: 'A value that can’t be used, and why' },
                ...denied
            }
        }
    },
    '/projects/{projectId}/email/preview': {
        post: {
            summary: 'A form email with sample answers, as the project’s settings make it',
            description:
                'Rendered by the server as it would send it. `settings`: unsaved changes to show instead of what is stored (checked as PATCH checks them). `kind`: form-confirm (default) or form-message.',
            tags: ['Projects'],
            parameters: [projectParam],
            requestBody: json({
                type: 'object',
                properties: {
                    kind: { type: 'string', enum: ['form-confirm', 'form-message'] },
                    locale: { type: 'string', enum: ['en', 'fr'] },
                    settings: settingsSchema
                }
            }),
            responses: {
                '200': {
                    description:
                        '`{ kind, locale, subject, preheader, html, text, from, replyTo? }`: the email',
                    ...json({
                        type: 'object',
                        properties: {
                            kind: str,
                            locale: str,
                            subject: str,
                            preheader: str,
                            html: str,
                            text: str,
                            from: str,
                            replyTo: str
                        }
                    })
                },
                '400': { description: 'A draft value that can’t be used, and why' },
                ...denied
            }
        }
    }
};

export default router;
