import { Router, type Request, type Response } from 'express';
import express from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import {
    checkUnsubscribe,
    setEmailTopic,
    updatePreferences,
    type EmailTopic
} from '@moteurio/core/email/unsubscribe.js';
import { getUserById } from '@moteurio/core/users.js';
import { esc } from '@moteurio/core/email/layout.js';
import { resolveEmailSettings } from '@moteurio/core/email/settings.js';
import { requireAuth } from '../middlewares/auth.js';
import { sendApiError } from '../utils/apiError.js';

/**
 * What a person chose for the mail the server sends them (look, language, notification emails),
 * and the unsubscribe link in those emails: a page with one button, and the one-click POST mail
 * apps send (RFC 8058). A GET alone changes nothing, so link scanners can't unsubscribe anyone.
 */
const router: Router = Router();

router.patch('/me/preferences', requireAuth, async (req: Request, res: Response) => {
    try {
        res.json({ preferences: await updatePreferences(req.user!.id, req.body ?? {}) });
    } catch (err) {
        sendApiError(res, req, err);
    }
});

const TOPIC_WORDS: Record<EmailTopic, { en: string; fr: string }> = {
    reviews: { en: 'review emails', fr: 'les courriels de révision' }
};

function page(title: string, body: string, fr: boolean): string {
    return `<!DOCTYPE html><html lang="${fr ? 'fr-CA' : 'en-CA'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>body{margin:0;font:16px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#F7EBD0;color:#3B2416}main{max-width:480px;margin:64px auto;padding:0 16px}h1{font-family:Georgia,serif;font-size:28px;line-height:1.2}button{font:inherit;font-weight:700;padding:12px 24px;border-radius:999px;border:2px solid #3B2416;background:#B8491A;color:#fff;cursor:pointer}@media (prefers-color-scheme:dark){body{background:#1C110A;color:#F7EBD0}button{background:#E57A47;color:#1C110A;border-color:#F7EBD0}}</style></head><body><main>${body}</main></body></html>`;
}

const params = (req: Request) => {
    const q = { ...(req.query as Record<string, unknown>), ...(req.body ?? {}) };
    return {
        u: typeof q.u === 'string' ? q.u : '',
        t: typeof q.t === 'string' ? q.t : '',
        s: typeof q.s === 'string' ? q.s : ''
    };
};

/** A page with one button; nothing changes until it is pressed. */
router.get('/email/unsubscribe', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const { u, t, s } = params(req);
    const user = checkUnsubscribe(u, t, s) ? getUserById(u) : undefined;
    const fr = (user?.preferences?.locale ?? resolveEmailSettings().locale).startsWith('fr');
    if (!user) {
        res.status(400).send(
            page(
                fr ? 'Lien inconnu' : 'Unknown link',
                fr
                    ? '<h1>Ce lien ne fonctionne pas</h1><p>Il est peut-être incomplet. Ouvrez celui du courriel tel quel.</p>'
                    : '<h1>This link doesn’t work</h1><p>It may be cut short. Open the one in the email as it is.</p>',
                fr
            )
        );
        return;
    }
    const what = TOPIC_WORDS[t as EmailTopic][fr ? 'fr' : 'en'];
    res.send(
        page(
            fr ? `Ne plus recevoir ${what}` : `Stop ${what}`,
            `<h1>${fr ? `Ne plus recevoir ${esc(what)}\u202f?` : `Stop ${esc(what)}?`}</h1><p>${esc(user.email)}</p><form method="post"><input type="hidden" name="u" value="${esc(u)}"><input type="hidden" name="t" value="${esc(t)}"><input type="hidden" name="s" value="${esc(s)}"><button type="submit">${fr ? `Ne plus les recevoir` : `Stop them`}</button></form><p>${fr ? 'Les courriels de connexion continuent d’arriver.' : 'Sign-in emails still come.'}</p>`,
            fr
        )
    );
});

/** The button, and mail apps' one-click unsubscribe (body `List-Unsubscribe=One-Click`). */
router.post(
    '/email/unsubscribe',
    express.urlencoded({ extended: false, limit: '4kb' }),
    async (req: Request, res: Response) => {
        res.setHeader('Cache-Control', 'no-store');
        const { u, t, s } = params(req);
        if (!checkUnsubscribe(u, t, s)) return void res.status(400).json({ error: 'Unknown link' });
        try {
            const user = await setEmailTopic(u, t as EmailTopic, false);
            const fr = (user.preferences?.locale ?? resolveEmailSettings().locale).startsWith('fr');
            const what = TOPIC_WORDS[t as EmailTopic][fr ? 'fr' : 'en'];
            // A browser pressing the button gets a page; a mail app's one-click POST, JSON.
            if (req.headers.accept?.includes('text/html'))
                return void res.send(
                    page(
                        fr ? 'C’est fait' : 'Done',
                        fr
                            ? `<h1>C’est fait</h1><p>Vous ne recevrez plus ${esc(what)}. Vous pouvez les réactiver dans vos préférences.</p>`
                            : `<h1>Done</h1><p>No more ${esc(what)}. You can turn them back on in your preferences.</p>`,
                        fr
                    )
                );
            res.json({ unsubscribed: t });
        } catch (err) {
            sendApiError(res, req, err);
        }
    }
);

const json = (schema: OpenAPIV3.SchemaObject) => ({ content: { 'application/json': { schema } } });
const preferencesSchema: OpenAPIV3.SchemaObject = {
    type: 'object',
    properties: {
        look: { type: 'string', enum: ['discotheque', 'folio'] },
        locale: { type: 'string' },
        emails: { type: 'object', properties: { reviews: { type: 'boolean' } } }
    }
};
const unsubscribeParams: OpenAPIV3.ParameterObject[] = [
    { name: 'u', in: 'query', required: true, schema: { type: 'string' }, description: 'User id' },
    { name: 't', in: 'query', required: true, schema: { type: 'string', enum: ['reviews'] } },
    { name: 's', in: 'query', required: true, schema: { type: 'string' }, description: 'Signature' }
];

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/auth/me/preferences': {
        patch: {
            summary: 'Change your look, language and notification emails',
            description:
                'Any of `look` (`discotheque`, `folio`), `locale` (`fr`, `en-CA`…) and `emails` (`{ "reviews": false }`); null clears `look` or `locale`. The server’s emails follow them when the operator lets them.',
            tags: ['Auth'],
            security: [{ bearerAuth: [] }],
            requestBody: json(preferencesSchema),
            responses: {
                '200': {
                    description: '`{ preferences }`: what is now stored',
                    ...json({ type: 'object', properties: { preferences: preferencesSchema } })
                },
                '400': { description: 'A value that can’t be used' },
                '401': { description: 'Not signed in' }
            }
        }
    },
    '/auth/email/unsubscribe': {
        get: {
            summary: 'The page behind an email’s unsubscribe link',
            description:
                'An HTML page with one button. Opening it changes nothing; the button (or a mail app’s one-click POST) does.',
            tags: ['Auth'],
            security: [],
            parameters: unsubscribeParams,
            responses: {
                '200': {
                    description: 'An HTML page asking to confirm',
                    content: { 'text/html': { schema: { type: 'string' } } }
                },
                '400': {
                    description: 'An HTML page: the link is unknown or cut short',
                    content: { 'text/html': { schema: { type: 'string' } } }
                }
            }
        },
        post: {
            summary: 'Stop one kind of notification email',
            description:
                'One-click unsubscribe (RFC 8058): the same `u`, `t` and `s` in the query or a form body. Sign-in mail can’t be stopped.',
            tags: ['Auth'],
            security: [],
            parameters: unsubscribeParams,
            responses: {
                '200': {
                    description:
                        '`{ unsubscribed }`: the topic now off (an HTML page for browsers)',
                    ...json({ type: 'object', properties: { unsubscribed: { type: 'string' } } })
                },
                '400': { description: 'Unknown or cut-short link' }
            }
        }
    }
};

export default router;
