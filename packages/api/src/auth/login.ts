import type { Request, Response } from 'express';
import express, { Router } from 'express';
import { loginUser, PASSWORD_MAX_LENGTH } from '@moteurio/core/auth.js';
import { loginRateLimiter } from '../middlewares/rateLimit.js';
import type { OpenAPIV3 } from 'openapi-types';
import { getMessage, sendApiError } from '../utils/apiError.js';
import {
    clearLoginFailures,
    delayMsForAttempt,
    getLoginFailureEntry,
    recordLoginFailure,
    nextRetryAfterSeconds,
    sleep,
    sweepStaleLoginFailures
} from './loginDelayStore.js';

const router: Router = express.Router();

const EMAIL_MAX_LENGTH = 255;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sanitizeEmail(value: unknown): string {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim().toLowerCase();
    if (trimmed.length > EMAIL_MAX_LENGTH) return '';
    if (!EMAIL_REGEX.test(trimmed)) return '';
    return trimmed;
}

router.post('/login', loginRateLimiter, async (req: Request, res: Response) => {
    let normalizedUsername = '';
    try {
        sweepStaleLoginFailures();
        normalizedUsername = sanitizeEmail(req.body?.username);
        if (!normalizedUsername) {
            return void res.status(400).json({ error: 'Missing username or password' });
        }
        const priorFailures = getLoginFailureEntry(normalizedUsername)?.attempts ?? 0;
        await sleep(delayMsForAttempt(priorFailures));

        const password = typeof req.body?.password === 'string' ? req.body.password : '';
        if (!password) {
            return void res.status(400).json({ error: 'Missing username or password' });
        }
        if (password.length > PASSWORD_MAX_LENGTH) {
            return void res.status(400).json({ error: 'Invalid request' });
        }
        const result = await loginUser(normalizedUsername, password);
        clearLoginFailures(normalizedUsername);
        // Two-step sign-in: no session yet, a ticket for POST /auth/two-factor/verify.
        if ('twoFactor' in result)
            return void res.json({ twoFactor: true, ticket: result.twoFactor.ticket });
        return void res.json(result);
    } catch (err: unknown) {
        const msg = getMessage(err).toLowerCase();
        if (msg.includes('invalid credentials') && normalizedUsername) {
            const failureCount = recordLoginFailure(normalizedUsername);
            // From the second wrong password on, the next try waits: say how long.
            if (failureCount >= 2) {
                const retryAfter = nextRetryAfterSeconds(failureCount);
                res.setHeader('Retry-After', String(retryAfter));
                return void res.status(401).json({
                    error: 'Too many tries. Wait, then try again.',
                    code: 'LOGIN_SLOWED',
                    retryAfter,
                    requestId: req.requestId
                });
            }
            return void res.status(401).json({
                error: 'Invalid credentials',
                code: 'LOGIN_FAILED',
                requestId: req.requestId
            });
        }
        return void sendApiError(res, req, err);
    }
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/auth/login': {
        post: {
            summary: 'Login and receive JWT token',
            tags: ['Auth'],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/LoginInput' }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Successful login',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    token: { type: 'string' },
                                    user: { $ref: '#/components/schemas/User' }
                                }
                            }
                        }
                    }
                },
                '400': {
                    description: 'Missing fields or invalid format',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    error: { type: 'string' }
                                }
                            }
                        }
                    }
                },
                '401': {
                    description:
                        'Wrong email or password (`LOGIN_FAILED`). From the second wrong password in a row, `LOGIN_SLOWED`: the next try waits `retryAfter` seconds (also the `Retry-After` header), doubling up to 30.',
                    headers: {
                        'Retry-After': {
                            description: 'With `LOGIN_SLOWED`: seconds the next try will wait',
                            schema: { type: 'integer' }
                        }
                    },
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    error: { type: 'string' },
                                    code: {
                                        type: 'string',
                                        enum: ['LOGIN_FAILED', 'LOGIN_SLOWED']
                                    },
                                    retryAfter: {
                                        type: 'integer',
                                        description:
                                            'With `LOGIN_SLOWED`: whole seconds the next try will wait'
                                    },
                                    requestId: { type: 'string' }
                                }
                            }
                        }
                    }
                },
                '429': {
                    description:
                        'Too many sign-in attempts from this address (`rate_limited`): `retryAfter` and `Retry-After` say how many seconds until the window resets'
                }
            }
        }
    }
};

export const schemas: OpenAPIV3.ComponentsObject['schemas'] = {
    LoginInput: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
            username: { type: 'string' },
            password: { type: 'string' }
        }
    }
};

export default router;
