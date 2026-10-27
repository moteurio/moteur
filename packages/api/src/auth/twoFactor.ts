import { Router, type Request, type Response } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import QRCode from 'qrcode';
import {
    beginTwoFactor,
    completeTwoFactor,
    disableTwoFactor,
    enableTwoFactor,
    hasTwoFactor,
    recoveryCodesLeft,
    renewRecoveryCodes,
    ticketUser
} from '@moteurio/core/twoFactor.js';
import { getUserById } from '@moteurio/core/users.js';
import { requireAuth } from '../middlewares/auth.js';
import { loginRateLimiter } from '../middlewares/rateLimit.js';
import { sendApiError } from '../utils/apiError.js';
import {
    clearLoginFailures,
    delayMsForAttempt,
    getLoginFailureEntry,
    recordLoginFailure,
    sleep
} from './loginDelayStore.js';

const router: Router = Router();

const text = (value: unknown, max = 40): string =>
    typeof value === 'string' && value.length <= max ? value : '';

/** Only the person, in a personal session: never an agent, never a token made for one. */
function personOnly(req: Request, res: Response): boolean {
    if (!req.user?.agent) return true;
    res.status(403).json({ error: 'A personal session is required' });
    return false;
}

router.use('/two-factor', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
});

/** The second step of signing in: the ticket from the first, and a code. */
router.post('/two-factor/verify', loginRateLimiter, async (req: Request, res: Response) => {
    let key = '';
    try {
        const ticket = text(req.body?.ticket, 2000);
        key = `two-factor:${ticketUser(ticket)}`;
        // Wrong codes slow the next try down, as wrong passwords do.
        await sleep(delayMsForAttempt(getLoginFailureEntry(key)?.attempts ?? 0));
        const result = await completeTwoFactor(ticket, text(req.body?.code));
        clearLoginFailures(key);
        return void res.json(result);
    } catch (err) {
        if (key && (err as { code?: string }).code === 'TWO_FACTOR_INVALID')
            recordLoginFailure(key);
        return void sendApiError(res, req, err);
    }
});

router.get('/two-factor', requireAuth, (req: Request, res: Response) => {
    if (!personOnly(req, res)) return;
    const user = getUserById(req.user!.id);
    const enabled = Boolean(user && hasTwoFactor(user));
    res.json({ enabled, ...(enabled && { recoveryCodesLeft: recoveryCodesLeft(req.user!.id) }) });
});

router.post('/two-factor/setup', requireAuth, async (req: Request, res: Response) => {
    if (!personOnly(req, res)) return;
    try {
        const setup = await beginTwoFactor(req.user!.id);
        const qr = await QRCode.toString(setup.otpauth, { type: 'svg', margin: 1 });
        return void res.json({ ...setup, qr });
    } catch (err) {
        return void sendApiError(res, req, err);
    }
});

router.post('/two-factor/enable', requireAuth, async (req: Request, res: Response) => {
    if (!personOnly(req, res)) return;
    try {
        return void res.json(await enableTwoFactor(req.user!.id, text(req.body?.code)));
    } catch (err) {
        return void sendApiError(res, req, err);
    }
});

router.post('/two-factor/disable', requireAuth, loginRateLimiter, async (req, res) => {
    if (!personOnly(req, res)) return;
    try {
        await disableTwoFactor(req.user!.id, text(req.body?.code));
        return void res.json({ enabled: false });
    } catch (err) {
        return void sendApiError(res, req, err);
    }
});

router.post('/two-factor/recovery-codes', requireAuth, loginRateLimiter, async (req, res) => {
    if (!personOnly(req, res)) return;
    try {
        return void res.json(await renewRecoveryCodes(req.user!.id, text(req.body?.code)));
    } catch (err) {
        return void sendApiError(res, req, err);
    }
});

const codeBody = (description: string): OpenAPIV3.RequestBodyObject => ({
    required: true,
    content: {
        'application/json': {
            schema: {
                type: 'object',
                required: ['code'],
                properties: { code: { type: 'string', description } }
            }
        }
    }
});
const APP_CODE = 'The six digits the authenticator app shows, or a recovery code';

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/auth/two-factor/verify': {
        post: {
            summary: 'Finish signing in with a code (two-step sign-in)',
            description:
                'When two-step sign-in is on, `POST /auth/login` (and a provider sign-in) answer `{ twoFactor: true, ticket }` instead of a token. Send the ticket (valid five minutes) with a code from the authenticator app, or one of the recovery codes (each works once).',
            tags: ['Auth'],
            security: [],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            required: ['ticket', 'code'],
                            properties: {
                                ticket: { type: 'string' },
                                code: { type: 'string', description: APP_CODE }
                            }
                        }
                    }
                }
            },
            responses: {
                '200': { description: '`{ token, user, usedRecovery }`' },
                '401': { description: 'Wrong code (TWO_FACTOR_INVALID) or expired ticket' }
            }
        }
    },
    '/auth/two-factor': {
        get: {
            summary: 'Whether two-step sign-in is on, and how many recovery codes are left',
            tags: ['Auth'],
            responses: { '200': { description: '`{ enabled, recoveryCodesLeft? }`' } }
        }
    },
    '/auth/two-factor/setup': {
        post: {
            summary: 'Start setting up two-step sign-in',
            description:
                'A new secret, its otpauth link and a QR code (SVG) for the authenticator app. It turns on only once a code confirms it.',
            tags: ['Auth'],
            responses: {
                '200': { description: '`{ secret, otpauth, qr }`' },
                '409': { description: 'Already on' }
            }
        }
    },
    '/auth/two-factor/enable': {
        post: {
            summary: 'Turn two-step sign-in on with a first code',
            tags: ['Auth'],
            requestBody: codeBody('The six digits the app shows'),
            responses: {
                '200': { description: '`{ recoveryCodes }`: ten codes, shown this once' },
                '400': { description: 'Wrong code' }
            }
        }
    },
    '/auth/two-factor/disable': {
        post: {
            summary: 'Turn two-step sign-in off',
            tags: ['Auth'],
            requestBody: codeBody(APP_CODE),
            responses: { '200': { description: '`{ enabled: false }`' } }
        }
    },
    '/auth/two-factor/recovery-codes': {
        post: {
            summary: 'New recovery codes (the old ones stop working)',
            tags: ['Auth'],
            requestBody: codeBody(APP_CODE),
            responses: { '200': { description: '`{ recoveryCodes }`' } }
        }
    }
};

export default router;
