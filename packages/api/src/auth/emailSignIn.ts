import { Router, type Request, type Response } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import {
    emailCodesAvailable,
    requestEmailCode,
    signupOpen,
    verifyEmailCode,
    verifyEmailLink
} from '@moteurio/core/emailSignIn.js';
import { demoProjectFor, updateOnboarding } from '@moteurio/core/onboarding.js';
import { legalLinks } from '@moteurio/core/serverSettings.js';
import { requireAuth } from '../middlewares/auth.js';
import { verificationRateLimiter } from '../middlewares/rateLimit.js';
import { sendApiError } from '../utils/apiError.js';
import { runOnboardingForNewUser } from './onboarding.js';

/**
 * Signing in or up with an email code, and a new person's first screens: what they came for,
 * and their copy of the demo when they want to be shown around.
 */
const router: Router = Router();

const text = (v: unknown, max: number) =>
    typeof v === 'string' && v.length <= max ? v : undefined;

router.get('/signup', (_req, res) => {
    res.json({ open: signupOpen(), emailCodes: emailCodesAvailable(), legal: legalLinks() });
});

router.post('/email/code', verificationRateLimiter, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const body = req.body ?? {};
    try {
        const campaign =
            body.campaign && typeof body.campaign === 'object' && !Array.isArray(body.campaign)
                ? (body.campaign as Record<string, string>)
                : undefined;
        await requestEmailCode(text(body.email, 300) ?? '', {
            from: text(body.from, 300),
            goal: text(body.goal, 60),
            campaign,
            locale: text(body.locale, 20)
        });
        // The same answer whether the address has an account or not.
        res.json({ sent: true });
    } catch (err) {
        sendApiError(res, req, err);
    }
});

router.post('/email/verify', verificationRateLimiter, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const body = req.body ?? {};
    try {
        const email = text(body.email, 300) ?? '';
        const options = { name: text(body.name, 200), onNewUser: runOnboardingForNewUser };
        // The email's link sends its token in place of the code.
        const token = text(body.token, 100);
        const result = token
            ? await verifyEmailLink(email, token, options)
            : await verifyEmailCode(email, text(body.code, 20) ?? '', options);
        if ('twoFactor' in result)
            return void res.json({ twoFactor: true, ticket: result.twoFactor.ticket });
        res.json({ token: result.token, isNew: result.isNew });
    } catch (err) {
        sendApiError(res, req, err);
    }
});

router.patch('/me/onboarding', requireAuth, async (req: Request, res: Response) => {
    try {
        const body = req.body ?? {};
        res.json({
            onboarding: await updateOnboarding(req.user!.id, {
                intent: body.intent,
                finished: body.finished,
                name: body.name
            })
        });
    } catch (err) {
        sendApiError(res, req, err);
    }
});

router.post('/me/demo', requireAuth, async (req: Request, res: Response) => {
    try {
        res.json({ projectId: await demoProjectFor(req.user!.id) });
    } catch (err) {
        sendApiError(res, req, err);
    }
});

const json = (schema: OpenAPIV3.SchemaObject) => ({ content: { 'application/json': { schema } } });

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/auth/signup': {
        get: {
            summary: 'Whether this server takes new accounts',
            description:
                '`open`: anyone may make an account (`MOTEUR_SIGNUP=open`); otherwise only invited people. `emailCodes`: whether codes can be sent by email. `legal`: where the Terms (`terms`) and the Privacy policy (`privacy`) are, for the sign-up page to link to; a key is absent when the server has none (`PATCH /operator/settings`, else `MOTEUR_TERMS_URL`, `MOTEUR_PRIVACY_URL`).',
            tags: ['Auth'],
            security: [],
            responses: {
                '200': {
                    description: 'Sign-up settings',
                    ...json({
                        type: 'object',
                        required: ['open', 'emailCodes', 'legal'],
                        properties: {
                            open: { type: 'boolean' },
                            emailCodes: { type: 'boolean' },
                            legal: {
                                type: 'object',
                                properties: {
                                    terms: { type: 'string', format: 'uri' },
                                    privacy: { type: 'string', format: 'uri' }
                                }
                            }
                        }
                    })
                }
            }
        }
    },
    '/auth/email/code': {
        post: {
            summary: 'Email a six-digit code to sign in, or to sign up',
            description:
                'A known address gets a code to sign in. A new one gets a code to make an account when the server is open. The answer is the same either way. One code a minute, ten an hour per address. `from`, `goal`, `campaign` and `locale` are kept on a new account.',
            tags: ['Auth'],
            security: [],
            requestBody: json({
                type: 'object',
                required: ['email'],
                properties: {
                    email: { type: 'string' },
                    from: { type: 'string', description: 'The site page that sent them' },
                    goal: { type: 'string' },
                    campaign: {
                        type: 'object',
                        description: 'utm_* values without the prefix',
                        additionalProperties: { type: 'string' }
                    },
                    locale: { type: 'string' }
                }
            }),
            responses: {
                '200': {
                    description: 'Sent, if the address can use one',
                    ...json({ type: 'object', properties: { sent: { type: 'boolean' } } })
                },
                '400': { description: 'Not an email address (`EMAIL_INVALID`)' },
                '429': {
                    description:
                        'Too soon or too many (`EMAIL_CODE_WAIT`, `EMAIL_CODE_LIMIT`), too many wrong codes for this address today (`EMAIL_CODE_LOCKED`), too many codes leaving the server this hour (`EMAIL_CODE_BUSY`), or the per-IP limit (`rate_limited`). Each carries `retryAfter` and the `Retry-After` header: the seconds until asking again can work.',
                    headers: {
                        'Retry-After': {
                            description: 'Seconds until another code can be asked for',
                            schema: { type: 'integer' }
                        }
                    },
                    ...json({
                        type: 'object',
                        properties: {
                            error: { type: 'string' },
                            code: { type: 'string' },
                            retryAfter: {
                                type: 'integer',
                                description: 'Whole seconds until another code can be asked for'
                            },
                            requestId: { type: 'string' }
                        }
                    })
                },
                '503': { description: 'This server cannot send codes (`EMAIL_UNAVAILABLE`)' }
            }
        }
    },
    '/auth/email/verify': {
        post: {
            summary: "Trade an email code, or the email link's token, for a session",
            description:
                "Signs in, or makes the account first. `name` names a new account. Send `token` (from the email's link, with `STUDIO_URL` set) in place of `code`: it works even when too many wrong codes have turned codes off for the day. With two-step sign-in on, answers a ticket for the app code instead (POST /auth/two-factor/verify).",
            tags: ['Auth'],
            security: [],
            requestBody: json({
                type: 'object',
                required: ['email'],
                properties: {
                    email: { type: 'string' },
                    code: { type: 'string' },
                    token: {
                        type: 'string',
                        description: "From the email's link, in place of `code`"
                    },
                    name: { type: 'string' }
                }
            }),
            responses: {
                '200': {
                    description: 'A session (`isNew` for a new account), or a two-step ticket',
                    ...json({
                        type: 'object',
                        properties: {
                            token: { type: 'string' },
                            isNew: { type: 'boolean' },
                            twoFactor: { type: 'boolean' },
                            ticket: { type: 'string' }
                        }
                    })
                },
                '400': {
                    description:
                        'Wrong code (`EMAIL_CODE_WRONG`), its fifth and last try used (`EMAIL_CODE_TRIES`: ask for another), or an expired code or link (`EMAIL_CODE_EXPIRED`, `EMAIL_LINK_EXPIRED`)'
                },
                '403': { description: 'The server is not taking new accounts (`SIGNUP_CLOSED`)' },
                '429': {
                    description:
                        'Ten wrong codes for this address today (`EMAIL_CODE_LOCKED`): codes are off until the oldest is a day old. `retryAfter` and `Retry-After` say when; the email’s link still works. Or the per-IP limit (`rate_limited`, with `retryAfter`).',
                    headers: {
                        'Retry-After': {
                            description: 'Seconds until codes work again',
                            schema: { type: 'integer' }
                        }
                    }
                }
            }
        }
    },
    '/auth/me/onboarding': {
        patch: {
            summary: 'Say what you came for and what to call you, or finish the welcome screens',
            tags: ['Auth'],
            security: [{ bearerAuth: [] }],
            requestBody: json({
                type: 'object',
                properties: {
                    intent: { type: 'string', enum: ['agency', 'own', 'developer', 'team'] },
                    name: { type: 'string', description: 'What to call you' },
                    finished: { type: 'boolean' }
                }
            }),
            responses: {
                '200': {
                    description: '`{ onboarding }`',
                    ...json({ type: 'object', properties: { onboarding: { type: 'object' } } })
                }
            }
        }
    },
    '/auth/me/demo': {
        post: {
            summary: 'Your copy of the demo project, made the first time you ask',
            tags: ['Auth'],
            security: [{ bearerAuth: [] }],
            responses: {
                '200': {
                    description: '`{ projectId }`',
                    ...json({ type: 'object', properties: { projectId: { type: 'string' } } })
                },
                '404': { description: 'This server has no demo project (`NO_DEMO`)' }
            }
        }
    }
};

export default router;
