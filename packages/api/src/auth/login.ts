import type { Request, Response } from 'express';
import express, { Router } from 'express';
import { loginUser } from '@moteurio/core/auth.js';
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
const PASSWORD_MAX_LENGTH = 128;
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
        const { token, user } = await loginUser(normalizedUsername, password);
        clearLoginFailures(normalizedUsername);
        return void res.json({ token, user });
    } catch (err: unknown) {
        const msg = getMessage(err).toLowerCase();
        if (msg.includes('invalid credentials') && normalizedUsername) {
            const failureCount = recordLoginFailure(normalizedUsername);
            const retryAfterSeconds = nextRetryAfterSeconds(failureCount);
            const body: Record<string, unknown> = { requestId: req.requestId };
            if (failureCount >= 2) {
                body.error = 'Too many failed attempts, please wait before trying again.';
                body.retryAfterSeconds = retryAfterSeconds;
            } else {
                body.error = 'Invalid credentials';
            }
            return void res.status(401).json(body);
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
                    description: 'Invalid credentials',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    error: { type: 'string' },
                                    retryAfterSeconds: {
                                        type: 'number',
                                        description:
                                            'Seconds to wait before the next login attempt (after repeated failures).'
                                    },
                                    requestId: { type: 'string' }
                                }
                            }
                        }
                    }
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
