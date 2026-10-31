import { Router, type Request, type Response } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import { rotatePersonalSession } from '@moteurio/core/auth.js';
import { confirmEmailChange, requestEmailChange } from '@moteurio/core/emailSignIn.js';
import { accountDeletion, accountExport, deleteAccount } from '@moteurio/core/account.js';
import { getProjectIdsForUser } from '@moteurio/core/projects.js';
import { withoutSecrets } from '@moteurio/core/users.js';
import { requireAuth } from '../middlewares/auth.js';
import { verificationRateLimiter } from '../middlewares/rateLimit.js';
import { sendApiError } from '../utils/apiError.js';
import { personalSession, recentPerson } from './providerSignIn.js';

/**
 * The signed-in person's own account: the email they sign in with, a copy of what the server
 * keeps about them, and deleting it. Only in their own session, never an agent's.
 */
const router: Router = Router();

const text = (v: unknown, max: number) =>
    typeof v === 'string' && v.length <= max ? v : undefined;

function notPersonal(res: Response) {
    res.status(403).json({
        error: 'A personal session is required',
        code: 'PERSONAL_SESSION_REQUIRED'
    });
}
function notRecent(res: Response, error: string) {
    res.status(403).json({ error, code: 'REAUTH_REQUIRED' });
}

router.use('/me', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
});

router.post('/me/email', requireAuth, verificationRateLimiter, async (req, res) => {
    try {
        if (!personalSession(req)) return notPersonal(res);
        if (!recentPerson(req))
            return notRecent(res, 'Sign in again before changing your sign-in email.');
        const body = req.body ?? {};
        await requestEmailChange(req.user!.id, text(body.email, 300) ?? '', text(body.locale, 20));
        res.json({ sent: true });
    } catch (err) {
        sendApiError(res, req, err);
    }
});

router.post('/me/email/verify', requireAuth, verificationRateLimiter, async (req, res) => {
    try {
        // Taken before the change: it ends every session, this one included.
        const previous = personalSession(req);
        if (!previous) return notPersonal(res);
        const body = req.body ?? {};
        const { user } = await confirmEmailChange(
            req.user!.id,
            text(body.email, 300) ?? '',
            text(body.code, 20) ?? ''
        );
        res.json({
            token: rotatePersonalSession(user, previous),
            user: withoutSecrets({ ...user, projects: getProjectIdsForUser(user.id) })
        });
    } catch (err) {
        sendApiError(res, req, err);
    }
});

router.get('/me/export', requireAuth, async (req: Request, res: Response) => {
    try {
        const session = personalSession(req);
        if (!session) return notPersonal(res);
        const data = await accountExport(req.user!.id, session.id);
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="moteur-account-${data.exportedAt.slice(0, 10)}.json"`
        );
        res.type('application/json').send(JSON.stringify(data, null, 2));
    } catch (err) {
        sendApiError(res, req, err);
    }
});

router.get('/me/deletion', requireAuth, (req: Request, res: Response) => {
    try {
        if (!personalSession(req)) return notPersonal(res);
        res.json(accountDeletion(req.user!.id));
    } catch (err) {
        sendApiError(res, req, err);
    }
});

router.delete('/me', requireAuth, async (req: Request, res: Response) => {
    try {
        if (!personalSession(req)) return notPersonal(res);
        if (!recentPerson(req))
            return notRecent(res, 'Sign in again before deleting your account.');
        await deleteAccount(req.user!.id, text(req.body?.email, 300) ?? '');
        res.status(204).end();
    } catch (err) {
        const { code, projects } = err as { code?: string; projects?: unknown };
        if (code === 'SOLE_ADMIN')
            return void res
                .status(409)
                .json({ error: (err as Error).message, code, projects, requestId: req.requestId });
        sendApiError(res, req, err);
    }
});

export default router;

const json = (schema: OpenAPIV3.SchemaObject) => ({ content: { 'application/json': { schema } } });
const refusal = (description: string): OpenAPIV3.ResponseObject => ({
    description,
    ...json({
        type: 'object',
        properties: {
            error: { type: 'string' },
            code: { type: 'string' },
            retryAfter: { type: 'integer' },
            requestId: { type: 'string' }
        }
    })
});
const projectRefs: OpenAPIV3.SchemaObject = {
    type: 'array',
    items: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } }
};
const secured = { tags: ['Auth'], security: [{ bearerAuth: [] }] };
const personal = refusal(
    'Not a personal session (`PERSONAL_SESSION_REQUIRED`: an agent or delegated token)'
);
const reauth = refusal(
    'Not a personal session (`PERSONAL_SESSION_REQUIRED`), or signed in more than 10 minutes ago (`REAUTH_REQUIRED`): sign in again'
);
const codeWait: OpenAPIV3.ResponseObject = {
    ...refusal(
        'Too soon or too many (`EMAIL_CODE_WAIT`, `EMAIL_CODE_LIMIT`, `EMAIL_CODE_LOCKED`, `EMAIL_CODE_BUSY`, or `rate_limited` from the per-IP limit). `retryAfter` and `Retry-After` say how many seconds to wait.'
    ),
    headers: {
        'Retry-After': { description: 'Seconds to wait', schema: { type: 'integer' } }
    }
};

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/auth/me/email': {
        post: {
            ...secured,
            summary: 'Email a code to a new sign-in address',
            description:
                'Needs a personal sign-in from the last 10 minutes. The code goes to the new address; `POST /auth/me/email/verify` makes the change. The same limits as sign-in codes: one a minute, ten an hour per address. `locale` (`fr`, `en`) picks the email’s language.',
            requestBody: json({
                type: 'object',
                required: ['email'],
                properties: { email: { type: 'string' }, locale: { type: 'string' } }
            }),
            responses: {
                '200': {
                    description: 'Sent',
                    ...json({ type: 'object', properties: { sent: { type: 'boolean' } } })
                },
                '400': refusal(
                    'Not an email address (`EMAIL_INVALID`), or already this account’s (`EMAIL_SAME`)'
                ),
                '403': reauth,
                '409': refusal('Another account uses this address (`EMAIL_TAKEN`)'),
                '429': codeWait,
                '503': refusal('This server cannot send email (`EMAIL_UNAVAILABLE`)')
            }
        }
    },
    '/auth/me/email/verify': {
        post: {
            ...secured,
            summary: 'Make the new address the sign-in email, with its code',
            description:
                'Every other session ends; the answer’s `token` replaces this one, with the same sign-in time and deadline. The old address is told, when the server sends email. Five tries per code, ten wrong codes a day per address.',
            requestBody: json({
                type: 'object',
                required: ['email', 'code'],
                properties: { email: { type: 'string' }, code: { type: 'string' } }
            }),
            responses: {
                '200': {
                    description: 'The new token, and the account as it is now',
                    ...json({
                        type: 'object',
                        properties: {
                            token: { type: 'string' },
                            user: { $ref: '#/components/schemas/User' }
                        }
                    })
                },
                '400': refusal(
                    'Wrong code (`EMAIL_CODE_WRONG`), its last try used (`EMAIL_CODE_TRIES`), or expired (`EMAIL_CODE_EXPIRED`)'
                ),
                '403': personal,
                '409': refusal('Another account took this address meanwhile (`EMAIL_TAKEN`)'),
                '429': {
                    ...refusal(
                        'Too many wrong codes for this address today (`EMAIL_CODE_LOCKED`), with `retryAfter`'
                    ),
                    headers: codeWait.headers
                }
            }
        }
    },
    '/auth/me/export': {
        get: {
            ...secured,
            summary: 'Download what the server keeps about you',
            description:
                'A JSON file (`moteur-account-<date>.json`): the account without secrets, how you sign in, your sessions, your projects and roles there, and what you did (each project’s activity log and the server’s, without the content itself). Content you wrote stays in its projects; their admins export it.',
            responses: {
                '200': {
                    description: 'The file',
                    headers: {
                        'Content-Disposition': {
                            description: 'attachment; filename="moteur-account-<date>.json"',
                            schema: { type: 'string' }
                        }
                    },
                    ...json({
                        type: 'object',
                        properties: {
                            exportedAt: { type: 'string', format: 'date-time' },
                            account: { type: 'object', additionalProperties: true },
                            signIn: {
                                type: 'object',
                                properties: {
                                    password: { type: 'boolean' },
                                    providers: { type: 'array', items: { type: 'string' } },
                                    twoFactor: { type: 'boolean' }
                                }
                            },
                            sessions: {
                                type: 'array',
                                items: { type: 'object', additionalProperties: true }
                            },
                            projects: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        id: { type: 'string' },
                                        name: { type: 'string' },
                                        roles: { type: 'array', items: { type: 'string' } }
                                    }
                                }
                            },
                            activity: {
                                type: 'array',
                                items: { type: 'object', additionalProperties: true }
                            }
                        }
                    })
                },
                '403': personal
            }
        }
    },
    '/auth/me/deletion': {
        get: {
            ...secured,
            summary: 'What deleting your account would do',
            description:
                '`deletes`: projects only you are in (they go to the project trash). `leaves`: projects with others and another admin (you leave; your content stays, credited by name). `blocked`: projects with others where you are the only admin; deleting is refused until someone else is admin.',
            responses: {
                '200': {
                    description: 'Each project, by what would happen to it',
                    ...json({
                        type: 'object',
                        properties: {
                            deletes: projectRefs,
                            leaves: projectRefs,
                            blocked: projectRefs
                        }
                    })
                },
                '403': personal
            }
        }
    },
    '/auth/me': {
        delete: {
            ...secured,
            summary: 'Delete your account',
            description:
                'Body `{ email }`: your sign-in email, typed back. Needs a personal sign-in from the last 10 minutes. Projects only you are in go to the project trash; you leave the others; invites you sent are withdrawn; every session ends; the account is removed.',
            requestBody: json({
                type: 'object',
                required: ['email'],
                properties: { email: { type: 'string' } }
            }),
            responses: {
                '204': { description: 'Deleted' },
                '400': refusal('The email typed back is not the account’s (`CONFIRM_MISMATCH`)'),
                '403': reauth,
                '409': {
                    description:
                        'You are the only admin of projects others are in (`SOLE_ADMIN`): `projects` lists them',
                    ...json({
                        type: 'object',
                        properties: {
                            error: { type: 'string' },
                            code: { type: 'string' },
                            projects: projectRefs,
                            requestId: { type: 'string' }
                        }
                    })
                }
            }
        }
    }
};
