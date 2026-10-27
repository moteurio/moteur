import { Router, type Request, type Response } from 'express';
import {
    describeProviderSignIn,
    requestProviderEmail,
    completeProviderEmail,
    connectProvider
} from '@moteurio/core/providerSignIn.js';
import { verifyJWT, rotatePersonalSession } from '@moteurio/core/auth.js';
import { connectedProviders, disconnectProvider } from '@moteurio/core/accountConnections.js';
import { requireAuthSession, type AuthSession } from '@moteurio/core/authSessions.js';
import { requireAuth } from '../middlewares/auth.js';
import { verificationRateLimiter } from '../middlewares/rateLimit.js';
import { sendApiError } from '../utils/apiError.js';
import { runOnboardingForNewUser } from './onboarding.js';
import type { OpenAPIV3 } from 'openapi-types';

export function providerBrowserProof(req: Request): string {
    return (
        (req.headers.cookie ?? '')
            .split(';')
            .map(part => part.trim())
            .find(part => part.startsWith('moteur_provider='))
            ?.slice('moteur_provider='.length) ?? ''
    );
}
function inputs(req: Request): [string, string] {
    const ticket =
        typeof req.body?.ticket === 'string' && req.body.ticket.length < 100 ? req.body.ticket : '';
    return [ticket, providerBrowserProof(req)];
}
function done(res: Response) {
    res.setHeader('Set-Cookie', 'moteur_provider=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
}
const router: Router = Router();
function recentPerson(req: Request): AuthSession | null {
    const payload = verifyJWT(req.headers.authorization!.replace(/^Bearer\s+/i, ''));
    const session = requireAuthSession(payload.sid, req.user!.id, req.user!.authVersion ?? 0);
    const valid =
        !req.user!.agent &&
        session.kind === 'person' &&
        typeof payload.auth_time === 'number' &&
        Date.now() / 1000 - payload.auth_time <= 600;
    return valid ? session : null;
}
router.get('/connections', requireAuth, (req, res) => {
    if (req.user!.agent)
        return void res.status(403).json({ error: 'A personal session is required' });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ providers: connectedProviders(req.user!) });
});
router.delete('/connections/:provider', requireAuth, async (req, res) => {
    try {
        const previous = recentPerson(req);
        if (!previous)
            return void res.status(403).json({
                error: 'Sign in again before changing sign-in methods.',
                code: 'REAUTH_REQUIRED'
            });
        const user = await disconnectProvider(req.user!.id, String(req.params.provider));
        res.json({ token: rotatePersonalSession(user, previous) });
    } catch (error) {
        sendApiError(res, req, error);
    }
});
router.use('/provider', verificationRateLimiter, (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
});
router.post('/provider/pending', (req, res) => {
    try {
        res.json(describeProviderSignIn(...inputs(req)));
    } catch (error) {
        sendApiError(res, req, error);
    }
});
router.post('/provider/email', async (req, res) => {
    try {
        await requestProviderEmail(
            ...inputs(req),
            typeof req.body?.email === 'string' ? req.body.email : ''
        );
        res.json({ sent: true });
    } catch (error) {
        sendApiError(res, req, error);
    }
});
router.post('/provider/verify', async (req, res) => {
    try {
        const result = await completeProviderEmail(
            ...inputs(req),
            typeof req.body?.code === 'string' ? req.body.code : '',
            runOnboardingForNewUser
        );
        done(res);
        if ('twoFactor' in result)
            return void res.json({ twoFactor: true, ticket: result.twoFactor.ticket });
        res.json({ token: result.token });
    } catch (error) {
        sendApiError(res, req, error);
    }
});
router.post('/provider/link', requireAuth, async (req, res) => {
    try {
        const previous = recentPerson(req);
        if (!previous) {
            return void res.status(403).json({
                error: 'Sign in again before connecting a provider.',
                code: 'REAUTH_REQUIRED'
            });
        }
        const user = await connectProvider(...inputs(req), req.user!.id);
        done(res);
        res.json({ token: rotatePersonalSession(user, previous) });
    } catch (error) {
        sendApiError(res, req, error);
    }
});
export default router;

const tokenSchema: OpenAPIV3.SchemaObject = {
    type: 'object',
    required: ['token'],
    properties: { token: { type: 'string' } }
};
const jsonResponse = (schema: OpenAPIV3.SchemaObject): OpenAPIV3.ResponseObject => ({
    description: 'Result',
    content: { 'application/json': { schema } }
});
function proofPost(
    summary: string,
    fields: Record<string, OpenAPIV3.SchemaObject>,
    required: string[],
    output: OpenAPIV3.SchemaObject,
    auth = false
): OpenAPIV3.PathItemObject {
    return {
        post: {
            summary,
            tags: ['Auth'],
            ...(auth ? { security: [{ bearerAuth: [] }] } : {}),
            parameters: [
                {
                    in: 'cookie',
                    name: 'moteur_provider',
                    required: true,
                    schema: { type: 'string' },
                    description: 'HttpOnly browser binding set by the OAuth callback'
                }
            ],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            required: ['ticket', ...required],
                            properties: { ticket: { type: 'string' }, ...fields }
                        }
                    }
                }
            },
            responses: {
                '200': jsonResponse(output),
                '400': { description: 'Invalid or expired proof' },
                '403': { description: 'Recent personal authentication required' },
                '409': {
                    description: 'Account already exists or identity belongs to another account'
                },
                '429': { description: 'Verification budget exceeded' },
                '503': { description: 'Verification delivery unavailable' }
            }
        }
    };
}
export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/auth/provider/pending': proofPost(
        'Describe a browser-bound pending provider sign-in',
        {},
        [],
        {
            type: 'object',
            properties: {
                provider: { type: 'string' },
                linkOnly: { type: 'boolean' },
                emailVerified: { type: 'boolean' },
                email: { type: 'string' },
                name: { type: 'string' },
                expiresAt: { type: 'string', format: 'date-time' }
            }
        }
    ),
    '/auth/provider/email': proofPost(
        'Send an email verification code',
        { email: { type: 'string', format: 'email' } },
        ['email'],
        { type: 'object', properties: { sent: { type: 'boolean' } } }
    ),
    '/auth/provider/verify': proofPost(
        'Verify email and create a new provider-backed account',
        { code: { type: 'string', pattern: '^[0-9]{6}$' } },
        ['code'],
        tokenSchema
    ),
    '/auth/provider/link': proofPost(
        'Explicitly link a provider after recent personal sign-in',
        {},
        [],
        tokenSchema,
        true
    ),
    '/auth/connections': {
        get: {
            summary: 'List connected sign-in provider IDs',
            tags: ['Auth'],
            security: [{ bearerAuth: [] }],
            responses: {
                '200': jsonResponse({
                    type: 'object',
                    properties: { providers: { type: 'array', items: { type: 'string' } } }
                })
            }
        }
    },
    '/auth/connections/{provider}': {
        delete: {
            summary: 'Disconnect a provider after recent personal sign-in',
            tags: ['Auth'],
            security: [{ bearerAuth: [] }],
            parameters: [
                {
                    in: 'path',
                    name: 'provider',
                    required: true,
                    schema: { type: 'string', enum: ['github', 'google', 'microsoft', 'oidc'] }
                }
            ],
            responses: {
                '200': jsonResponse(tokenSchema),
                '403': { description: 'Recent personal authentication required' },
                '409': { description: 'Cannot remove the last sign-in method' }
            }
        }
    }
};
