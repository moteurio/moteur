import { Router, type Request, type Response } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import {
    emailCodesAvailable,
    requestEmailCode,
    signupOpen,
    verifyEmailCode
} from '@moteurio/core/emailSignIn.js';
import { demoProjectFor, updateOnboarding } from '@moteurio/core/onboarding.js';
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
    res.json({ open: signupOpen(), emailCodes: emailCodesAvailable() });
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
        const result = await verifyEmailCode(
            text(body.email, 300) ?? '',
            text(body.code, 20) ?? '',
            {
                name: text(body.name, 200),
                onNewUser: runOnboardingForNewUser
            }
        );
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
                '`open`: anyone may make an account (`MOTEUR_SIGNUP=open`); otherwise only invited people. `emailCodes`: whether codes can be sent by email.',
            tags: ['Auth'],
            security: [],
            responses: {
                '200': {
                    description: 'Sign-up settings',
                    ...json({
                        type: 'object',
                        properties: { open: { type: 'boolean' }, emailCodes: { type: 'boolean' } }
                    })
                }
            }
        }
    },
    '/auth/email/code': {
        post: {
            summary: 'Email a six-digit code to sign in, or to sign up',
            description:
                'A known address gets a code to sign in. A new one gets a code to make an account when the server is open. The answer is the same either way. One code a minute, five an hour per address. `from`, `goal`, `campaign` and `locale` are kept on a new account.',
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
                '200': { description: 'Sent, if the address can use one' },
                '400': { description: 'Not an email address (`EMAIL_INVALID`)' },
                '429': {
                    description: 'Too soon, or too many (`EMAIL_CODE_WAIT`, `EMAIL_CODE_LIMIT`)'
                },
                '503': { description: 'This server cannot send codes (`EMAIL_UNAVAILABLE`)' }
            }
        }
    },
    '/auth/email/verify': {
        post: {
            summary: 'Trade an email code for a session',
            description:
                'Signs in, or makes the account first. `name` names a new account. With two-step sign-in on, answers a ticket for the app code instead (POST /auth/two-factor/verify).',
            tags: ['Auth'],
            security: [],
            requestBody: json({
                type: 'object',
                required: ['email', 'code'],
                properties: {
                    email: { type: 'string' },
                    code: { type: 'string' },
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
                    description: 'Wrong or expired code (`EMAIL_CODE_WRONG`, `EMAIL_CODE_EXPIRED`)'
                },
                '403': { description: 'The server is not taking new accounts' }
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
            responses: { '200': { description: '`{ onboarding }`' } }
        }
    },
    '/auth/me/demo': {
        post: {
            summary: 'Your copy of the demo project, made the first time you ask',
            tags: ['Auth'],
            security: [{ bearerAuth: [] }],
            responses: {
                '200': { description: '`{ projectId }`' },
                '404': { description: 'This server has no demo project (`NO_DEMO`)' }
            }
        }
    }
};

export default router;
