import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import {
    readEmailSettings,
    resolveEmailSettings,
    saveEmailSettings,
    EMAIL_LOOKS,
    type EmailLook
} from '@moteurio/core/email/settings.js';
import { DESIGNS } from '@moteurio/core/email/layout.js';
import { renderEmail } from '@moteurio/core/email/render.js';
import {
    EMAIL_KINDS,
    EMAIL_VARIANTS,
    samples,
    type EmailKind,
    type EmailVariant
} from '@moteurio/core/email/templates.js';
import { dkimConfig, mailUnavailable, smtpPort } from '@moteurio/core/email/transport.js';
import { runEmailCheck } from '@moteurio/core/email/check.js';
import { sendApiError } from '../utils/apiError.js';

/**
 * The server's email, for its operator: who it comes from and how it looks (stored in
 * data/operator/email.json), a check of what the server can verify, and a preview of every email.
 * Mounted under /operator, after requireOperator.
 */
const router: Router = Router();

function transport() {
    const dkim = dkimConfig();
    return {
        configured: !mailUnavailable(),
        unavailable: mailUnavailable(),
        host: process.env.SMTP_HOST || null,
        port: smtpPort(),
        signsIn: Boolean(process.env.SMTP_USER && process.env.SMTP_PASS),
        dkim: dkim ? { domain: dkim.domainName, selector: dkim.keySelector } : null,
        returnPath: process.env.SMTP_RETURN_PATH || null
    };
}

function view() {
    const stored = readEmailSettings();
    return { settings: stored, effective: resolveEmailSettings(stored), transport: transport() };
}

router.get('/', (_req: Request, res: Response) => {
    res.json({ ...view(), kinds: EMAIL_KINDS, designs: DESIGNS.map(d => d.id) });
});

router.patch('/', (req: Request, res: Response) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body))
        return void res.status(400).json({ error: 'Body must be an object of settings' });
    try {
        saveEmailSettings(body, req.operator?.email ?? 'operator');
        console.log(`[operators] ${req.operator?.email} changed the email settings`);
        res.json(view());
    } catch (err) {
        sendApiError(res, req, err);
    }
});

router.post('/check', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { to?: unknown; selectors?: unknown };
    const to = typeof body.to === 'string' && body.to.trim() ? body.to.trim() : undefined;
    if (to && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to))
        return void res.status(400).json({ error: 'to must be an email address' });
    const selectors = Array.isArray(body.selectors)
        ? body.selectors.filter((s): s is string => typeof s === 'string' && /^[\w.-]+$/.test(s))
        : [];
    try {
        res.json(await runEmailCheck({ to, selectors }));
    } catch (err) {
        sendApiError(res, req, err);
    }
});

router.get('/preview/:kind', (req: Request, res: Response) => {
    const kind = (req.params as Record<string, string>).kind as EmailKind;
    if (!EMAIL_KINDS.includes(kind))
        return void res.status(404).json({ error: `Kinds are ${EMAIL_KINDS.join(', ')}` });
    const q = req.query as Record<string, string | undefined>;
    const locale = q.locale?.startsWith('fr') ? 'fr' : q.locale ? 'en' : undefined;
    const look = EMAIL_LOOKS.includes(q.look as EmailLook) ? (q.look as EmailLook) : undefined;
    const email = renderEmail(kind, samples(locale ?? resolveEmailSettings().locale)[kind], {
        locale,
        forceLook: look,
        variant: EMAIL_VARIANTS.includes(q.variant as EmailVariant)
            ? (q.variant as EmailVariant)
            : undefined,
        images: 'data'
    });
    if (q.format === 'text') return void res.type('text/plain; charset=utf-8').send(email.text);
    if (q.format === 'json') {
        const { attachments: _a, ...rest } = email;
        return void res.json(rest);
    }
    res.type('text/html; charset=utf-8').send(email.html);
});

const str: OpenAPIV3.SchemaObject = { type: 'string' };
const settingsSchema: OpenAPIV3.SchemaObject = {
    type: 'object',
    properties: {
        fromName: {
            ...str,
            description: 'Name the mail comes from (default: SMTP_FROM’s, else productName)'
        },
        fromAddress: { ...str, description: 'Address the mail comes from (default: SMTP_FROM’s)' },
        replyTo: { ...str, description: 'Where replies go (invitations reply to the inviter)' },
        productName: { ...str, description: 'The name the emails say (default Moteur)' },
        look: { type: 'string', enum: ['discotheque', 'folio', 'recipient'] },
        accent: {
            ...str,
            description: '#RRGGBB for buttons and links; white text on it must read at 4.5:1'
        },
        logoUrl: { ...str, description: 'An https image shown in place of the name' },
        logoFile: {
            ...str,
            description: 'A PNG, JPEG or GIF on the server (≤ 100 KB), sent inside each email'
        },
        logoWidth: { type: 'integer', minimum: 24, maximum: 300 },
        footer: { ...str, description: 'Postal address or legal line at the foot' },
        supportUrl: { ...str, description: 'An https page where people get help' },
        productTagline: {
            description:
                'What the product is, in a sentence or two (300 characters at most), for the emails that are someone’s first contact. One text for every language, or one per language.',
            oneOf: [
                str,
                { type: 'object', properties: { en: str, fr: str }, additionalProperties: false }
            ]
        },
        locale: { type: 'string', enum: ['en', 'fr'] }
    }
};
const viewSchema: OpenAPIV3.SchemaObject = {
    type: 'object',
    properties: {
        settings: { ...settingsSchema, description: 'What the operator stored' },
        effective: { ...settingsSchema, description: 'What emails use, defaults filled in' },
        transport: {
            type: 'object',
            properties: {
                configured: { type: 'boolean' },
                unavailable: { ...str, nullable: true },
                host: { ...str, nullable: true },
                port: { type: 'integer' },
                signsIn: { type: 'boolean' },
                dkim: {
                    type: 'object',
                    nullable: true,
                    properties: { domain: str, selector: str }
                },
                returnPath: { ...str, nullable: true }
            }
        }
    }
};
const json = (schema: OpenAPIV3.SchemaObject) => ({ content: { 'application/json': { schema } } });
const denied = {
    '401': { description: 'Not signed in' },
    '403': { description: 'Operator access required' }
};

export const emailPaths: Record<string, OpenAPIV3.PathItemObject> = {
    '/operator/email': {
        get: {
            summary: 'The server’s email settings',
            description:
                'Who mail comes from, how it looks, and how it is sent (SMTP host, DKIM; never secrets). `kinds` lists every email, `designs` the design directions.',
            tags: ['Operator'],
            responses: {
                '200': {
                    description: '`{ settings, effective, transport, kinds, designs }`',
                    ...json({
                        ...viewSchema,
                        properties: {
                            ...viewSchema.properties,
                            kinds: { type: 'array', items: str },
                            designs: { type: 'array', items: str }
                        }
                    })
                },
                ...denied
            }
        },
        patch: {
            summary: 'Change the server’s email settings',
            description:
                'Any of the settings; null or an empty string puts one back to its default. Credentials stay in the environment.',
            tags: ['Operator'],
            requestBody: { required: true, ...json(settingsSchema) },
            responses: {
                '200': { description: '`{ settings, effective, transport }`', ...json(viewSchema) },
                '400': { description: 'A value that can’t be used, and why' },
                ...denied
            }
        }
    },
    '/operator/email/check': {
        post: {
            summary: 'Check the server’s email, and send a test',
            description:
                'Checks the SMTP server answers, the From domain’s SPF, DMARC, DKIM and MX records, and that links match the From domain. With `to`, sends a test email there. `selectors`: DKIM selectors to look for besides the usual ones.',
            tags: ['Operator'],
            requestBody: json({
                type: 'object',
                properties: {
                    to: { type: 'string', format: 'email' },
                    selectors: { type: 'array', items: str }
                }
            }),
            responses: {
                '200': {
                    description:
                        '`{ checks, sent? }`: each check’s `status` is ok, warn, fail or info',
                    ...json({
                        type: 'object',
                        properties: {
                            checks: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        id: str,
                                        status: {
                                            type: 'string',
                                            enum: ['ok', 'warn', 'fail', 'info']
                                        },
                                        message: str,
                                        found: str
                                    }
                                }
                            },
                            sent: {
                                type: 'object',
                                properties: { to: str, messageId: str }
                            }
                        }
                    })
                },
                '400': { description: '`to` is not an email address' },
                ...denied
            }
        }
    },
    '/operator/email/preview/{kind}': {
        get: {
            summary: 'One email with sample data',
            description:
                'As the server would send it, with its settings. `format`: html (default), text, or json (subject, preheader, html, text).',
            tags: ['Operator'],
            parameters: [
                {
                    name: 'kind',
                    in: 'path',
                    required: true,
                    schema: { type: 'string', enum: [...EMAIL_KINDS] }
                },
                { name: 'locale', in: 'query', schema: { type: 'string', enum: ['en', 'fr'] } },
                { name: 'look', in: 'query', schema: { type: 'string', enum: [...EMAIL_LOOKS] } },
                {
                    name: 'variant',
                    in: 'query',
                    description:
                        'For the first-contact emails (invite, welcome, form-confirm): which of the two ways to set them. Default `a`.',
                    schema: { type: 'string', enum: [...EMAIL_VARIANTS] }
                },
                {
                    name: 'format',
                    in: 'query',
                    schema: { type: 'string', enum: ['html', 'text', 'json'] }
                }
            ],
            responses: {
                '200': {
                    description: 'The email’s HTML, its plain text, or both as JSON',
                    content: {
                        'text/html': { schema: str },
                        'text/plain': { schema: str },
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    kind: str,
                                    subject: str,
                                    preheader: str,
                                    html: str,
                                    text: str,
                                    look: str,
                                    design: str,
                                    variant: str,
                                    locale: str
                                }
                            }
                        }
                    }
                },
                '404': { description: 'No such email' },
                ...denied
            }
        }
    }
};

export default router;
