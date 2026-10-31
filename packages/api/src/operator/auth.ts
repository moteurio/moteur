/**
 * Operators' own sign-in, apart from users': password plus an authenticator code, and the one-time
 * link that sets both up. Mounted at /operator/auth, before the operator routes (which need an
 * operator token from here).
 */
import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import QRCode from 'qrcode';
import type { OpenAPIV3 } from 'openapi-types';
import {
    completeEnrollment,
    loginOperator,
    OperatorAuthError,
    startEnrollment
} from '@moteurio/core/operators.js';
import { requireOperator } from '../middlewares/auth.js';
import { limitReached } from '../middlewares/rateLimit.js';

const router: Router = Router();

/** Ten tries per address every 15 minutes, on top of the per-email lockout. */
const strict = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    ...limitReached('Too many tries. Try again in 15 minutes.')
});

function refuse(res: Response, err: unknown) {
    if (err instanceof OperatorAuthError) {
        return void res.status(err.status).json({ error: err.message });
    }
    console.error('[operators]', err);
    res.status(500).json({ error: 'Sign-in failed' });
}

const body = (req: Request) => (req.body ?? {}) as Record<string, unknown>;
const text = (v: unknown) => (typeof v === 'string' ? v : '');

router.post('/login', strict, async (req: Request, res: Response) => {
    const b = body(req);
    try {
        const session = await loginOperator({
            email: text(b.email),
            password: text(b.password),
            code: text(b.code)
        });
        console.log(`[operators] ${session.operator.email} signed in from ${req.ip}`);
        res.json(session);
    } catch (err) {
        refuse(res, err);
    }
});

router.get('/enroll/:token', strict, async (req: Request, res: Response) => {
    try {
        const enrollment = startEnrollment((req.params as Record<string, string>).token);
        // The QR code an authenticator app scans, drawn here so the secret goes nowhere else.
        const qr = await QRCode.toString(enrollment.otpauth, { type: 'svg', margin: 1 });
        res.set('Cache-Control', 'no-store').json({ ...enrollment, qr });
    } catch (err) {
        refuse(res, err);
    }
});

router.post('/enroll/:token', strict, async (req: Request, res: Response) => {
    const b = body(req);
    try {
        const done = await completeEnrollment((req.params as Record<string, string>).token, {
            password: text(b.password),
            code: text(b.code)
        });
        console.log(`[operators] ${done.operator.email} set up their sign-in from ${req.ip}`);
        res.json(done);
    } catch (err) {
        refuse(res, err);
    }
});

router.get('/me', requireOperator, (req: Request, res: Response, _next: NextFunction) => {
    res.json({ operator: req.operator });
});

const json = (schema: OpenAPIV3.SchemaObject) => ({ 'application/json': { schema } });
const session: OpenAPIV3.SchemaObject = {
    type: 'object',
    properties: {
        token: { type: 'string', description: 'An operator token: 1 hour, operator routes only' },
        expiresAt: { type: 'string', format: 'date-time' },
        operator: { type: 'object' }
    }
};

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/operator/auth/login': {
        post: {
            summary: 'Sign in as an operator (password and authenticator code)',
            description:
                'Operators are not users: they live in OPERATORS_FILE. `code` is the 6-digit code from their authenticator app, or one of their recovery codes (used once). Every mistake answers the same 401; five in a row lock the email for 15 minutes (429).',
            tags: ['Operator'],
            requestBody: {
                required: true,
                content: json({
                    type: 'object',
                    required: ['email', 'password', 'code'],
                    properties: {
                        email: { type: 'string' },
                        password: { type: 'string' },
                        code: { type: 'string' }
                    }
                })
            },
            responses: {
                '200': { description: 'Signed in', content: json(session) },
                '401': { description: 'Wrong email, password or code' },
                '429': { description: 'Locked for 15 minutes' }
            }
        }
    },
    '/operator/auth/enroll/{token}': {
        get: {
            summary: 'What a one-time operator link is for, with the authenticator secret to add',
            tags: ['Operator'],
            parameters: [{ name: 'token', in: 'path', required: true, schema: { type: 'string' } }],
            responses: {
                '200': {
                    description:
                        '`{ email, name, secret, otpauth, qr }`: `qr` is an SVG of the otpauth link, for the authenticator app to scan.',
                    content: json({ type: 'object' })
                },
                '410': { description: 'Expired or already used' }
            }
        },
        post: {
            summary: 'Finish a one-time operator link: password and a first authenticator code',
            description:
                'The password needs at least 12 characters. Answers with the recovery codes (shown only now) and a session.',
            tags: ['Operator'],
            parameters: [{ name: 'token', in: 'path', required: true, schema: { type: 'string' } }],
            requestBody: {
                required: true,
                content: json({
                    type: 'object',
                    required: ['password', 'code'],
                    properties: { password: { type: 'string' }, code: { type: 'string' } }
                })
            },
            responses: {
                '200': { description: 'Set up and signed in', content: json(session) },
                '400': { description: 'Password too short, or the code is not right' },
                '410': { description: 'Expired or already used' }
            }
        }
    },
    '/operator/auth/me': {
        get: {
            summary: 'The operator signed in',
            tags: ['Operator'],
            security: [{ operatorAuth: [] }],
            responses: {
                '200': { description: '`{ operator }`', content: json({ type: 'object' }) },
                '401': { description: 'Operator sign-in required' }
            }
        }
    }
};

export default router;
