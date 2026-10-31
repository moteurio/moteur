import { Router, type Request, type Response } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import { rotatePersonalSession } from '@moteurio/core/auth.js';
import {
    beginPasskeyRegistration,
    beginPasskeySignIn,
    finishPasskeyRegistration,
    finishPasskeySignIn,
    listPasskeys,
    passkeysAvailable,
    removePasskey,
    renamePasskey
} from '@moteurio/core/passkeys.js';
import { requireAuth } from '../middlewares/auth.js';
import { verificationRateLimiter } from '../middlewares/rateLimit.js';
import { getMessage, sendApiError } from '../utils/apiError.js';
import { recentPerson } from './providerSignIn.js';

/**
 * Passkeys: adding, listing, renaming and removing them on the account page, and signing in with
 * one. Adding and removing need a sign-in from the last 10 minutes, as other sign-in methods do.
 */
const router: Router = Router();

const text = (value: unknown, max: number): string =>
    typeof value === 'string' && value.length <= max ? value : '';

const credential = <T>(value: unknown): T => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw Object.assign(new Error('Send the browser’s passkey answer as `response`.'), {
            status: 400,
            code: 'PASSKEY_INVALID'
        });
    return value as T;
};

/** Only the person, in a personal session: never an agent, never a token made for one. */
function personOnly(req: Request, res: Response): boolean {
    if (!req.user?.agent) return true;
    res.status(403).json({ error: 'A personal session is required' });
    return false;
}

function recentOnly(req: Request, res: Response): ReturnType<typeof recentPerson> {
    const session = recentPerson(req);
    if (!session)
        res.status(403).json({
            error: 'Sign in again before changing sign-in methods.',
            code: 'REAUTH_REQUIRED'
        });
    return session;
}

/** A passkey the server doesn't know: the browser can be told to forget it. */
function sendSignInError(req: Request, res: Response, err: unknown): void {
    const { code, credentialId, rpId } = err as Record<string, unknown>;
    if (code === 'PASSKEY_UNKNOWN')
        return void res
            .status(401)
            .json({ error: getMessage(err), code, credentialId, rpId, requestId: req.requestId });
    sendApiError(res, req, err);
}

router.use('/passkeys', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
});

router.post('/passkeys/sign-in/options', verificationRateLimiter, async (req, res) => {
    try {
        const options = await beginPasskeySignIn({
            email: text(req.body?.email, 300) || undefined,
            ticket: text(req.body?.ticket, 2000) || undefined
        });
        res.json({ options });
    } catch (err) {
        sendApiError(res, req, err);
    }
});

router.post('/passkeys/sign-in/verify', verificationRateLimiter, async (req, res) => {
    try {
        const { token, user } = await finishPasskeySignIn(credential(req.body?.response));
        res.json({ token, user });
    } catch (err) {
        sendSignInError(req, res, err);
    }
});

router.get('/passkeys', requireAuth, (req, res) => {
    if (!personOnly(req, res)) return;
    try {
        res.json({ available: passkeysAvailable(), passkeys: listPasskeys(req.user!.id) });
    } catch (err) {
        sendApiError(res, req, err);
    }
});

router.post(
    '/passkeys/register/options',
    requireAuth,
    verificationRateLimiter,
    async (req, res) => {
        try {
            if (!personOnly(req, res) || !recentOnly(req, res)) return;
            res.json({ options: await beginPasskeyRegistration(req.user!.id) });
        } catch (err) {
            sendApiError(res, req, err);
        }
    }
);

router.post('/passkeys/register/verify', requireAuth, verificationRateLimiter, async (req, res) => {
    if (!personOnly(req, res)) return;
    try {
        const passkey = await finishPasskeyRegistration(
            req.user!.id,
            credential(req.body?.response),
            {
                name: text(req.body?.name, 200) || undefined,
                userAgent: text(req.headers['user-agent'], 1000) || undefined
            }
        );
        res.status(201).json({ passkey });
    } catch (err) {
        sendApiError(res, req, err);
    }
});

router.patch('/passkeys/:passkeyId', requireAuth, async (req, res) => {
    if (!personOnly(req, res)) return;
    try {
        res.json({
            passkey: await renamePasskey(req.user!.id, String(req.params.passkeyId), req.body?.name)
        });
    } catch (err) {
        sendApiError(res, req, err);
    }
});

router.delete('/passkeys/:passkeyId', requireAuth, async (req, res) => {
    try {
        if (!personOnly(req, res)) return;
        const previous = recentOnly(req, res);
        if (!previous) return;
        const user = await removePasskey(req.user!.id, String(req.params.passkeyId));
        res.json({ token: rotatePersonalSession(user, previous) });
    } catch (err) {
        sendApiError(res, req, err);
    }
});

export default router;

// ---------------------------------------------------------------------------------------------

const json = (description: string, schema: OpenAPIV3.SchemaObject): OpenAPIV3.ResponseObject => ({
    description,
    content: { 'application/json': { schema } }
});
const body = (schema: OpenAPIV3.SchemaObject, required = true): OpenAPIV3.RequestBodyObject => ({
    required,
    content: { 'application/json': { schema } }
});
const str = { type: 'string' } as const;
const browserAnswer: OpenAPIV3.SchemaObject = {
    type: 'object',
    description:
        'The browser’s answer as JSON: `PublicKeyCredential.toJSON()`, or what `@simplewebauthn/browser` returns',
    required: ['id', 'rawId', 'type', 'response'],
    properties: {
        id: str,
        rawId: str,
        type: { type: 'string', enum: ['public-key'] },
        response: { type: 'object' },
        clientExtensionResults: { type: 'object' },
        authenticatorAttachment: str
    }
};
const passkeySchema: OpenAPIV3.SchemaObject = {
    type: 'object',
    required: ['id', 'name', 'createdAt', 'synced', 'deviceType'],
    properties: {
        id: { type: 'string', description: 'The credential id (base64url)' },
        name: str,
        createdAt: { type: 'string', format: 'date-time' },
        lastUsedAt: { type: 'string', format: 'date-time' },
        synced: {
            type: 'boolean',
            description: 'Kept in sync across the person’s devices (iCloud Keychain, Google…)'
        },
        deviceType: { type: 'string', enum: ['singleDevice', 'multiDevice'] },
        provider: {
            type: 'string',
            description: 'Where it lives, for known authenticators ("iCloud Keychain", "1Password")'
        },
        createdOn: { type: 'string', description: 'Browser and system it was made on' },
        transports: { type: 'array', items: str }
    }
};
const idParam: OpenAPIV3.ParameterObject = {
    in: 'path',
    name: 'passkeyId',
    required: true,
    schema: str
};
const reauth = { description: 'A sign-in from the last 10 minutes is needed (`REAUTH_REQUIRED`)' };
const unavailable = {
    description: 'Passkeys aren’t set up on this server (`PASSKEYS_UNAVAILABLE`)'
};

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/auth/passkeys/sign-in/options': {
        post: {
            summary: 'Start signing in with a passkey',
            description:
                'Options for `navigator.credentials.get()`. With no body, any passkey for this server answers: use it for the browser’s autofill (`mediation: "conditional"`) too. With `email`, only that account’s passkey will do; the answer is the same whether the address has an account or not, and lists no passkeys. With `ticket` (the two-step ticket after a password or an email code), the passkey stands in for the authenticator app’s code, and `allowCredentials` lists that person’s passkeys. A challenge works once, for five minutes: ask again after that.',
            tags: ['Auth'],
            security: [],
            requestBody: body(
                {
                    type: 'object',
                    properties: {
                        email: str,
                        ticket: { type: 'string', description: 'Two-step ticket' }
                    }
                },
                false
            ),
            responses: {
                '200': json('`{ options }`: pass `options` to the browser', {
                    type: 'object',
                    properties: { options: { type: 'object' } }
                }),
                '401': { description: 'The two-step ticket expired (`TWO_FACTOR_EXPIRED`)' },
                '404': unavailable,
                '409': { description: 'The ticket’s account has no passkey (`NO_PASSKEY`)' },
                '429': { description: 'Too many requests from this address' }
            }
        }
    },
    '/auth/passkeys/sign-in/verify': {
        post: {
            summary: 'Finish signing in with a passkey',
            description:
                'The browser’s signed answer becomes a session. A passkey proves the device and the person who unlocked it, so no two-step code follows, even when two-step sign-in is on.',
            tags: ['Auth'],
            security: [],
            requestBody: body({
                type: 'object',
                required: ['response'],
                properties: { response: browserAnswer }
            }),
            responses: {
                '200': json('`{ token, user }`: the session, as `POST /auth/login` gives it', {
                    type: 'object',
                    properties: { token: str, user: { $ref: '#/components/schemas/User' } }
                }),
                '400': {
                    description:
                        'Expired or used challenge (`PASSKEY_EXPIRED`), unreadable answer (`PASSKEY_INVALID`), or another page asked (`PASSKEY_ORIGIN`)'
                },
                '401': {
                    description:
                        'Signature or user verification failed (`PASSKEY_INVALID`), the passkey is for another account than the email given (`PASSKEY_WRONG_ACCOUNT`), or it is unknown here (`PASSKEY_UNKNOWN`, with `credentialId` and `rpId` for `PublicKeyCredential.signalUnknownCredential()`)'
                },
                '403': { description: 'The account is turned off' },
                '404': unavailable,
                '429': { description: 'Too many requests from this address' }
            }
        }
    },
    '/auth/passkeys': {
        get: {
            summary: 'The signed-in person’s passkeys',
            tags: ['Auth'],
            security: [{ bearerAuth: [] }],
            responses: {
                '200': json(
                    '`{ available, passkeys }`: whether the server offers them, and the list',
                    {
                        type: 'object',
                        properties: {
                            available: { type: 'boolean' },
                            passkeys: { type: 'array', items: passkeySchema }
                        }
                    }
                ),
                '403': { description: 'A personal session is required' }
            }
        }
    },
    '/auth/passkeys/register/options': {
        post: {
            summary: 'Start adding a passkey',
            description:
                'Options for `navigator.credentials.create()`. Needs a sign-in from the last 10 minutes. The passkey must be discoverable and verify the person (face, finger, PIN). Up to 20 per account.',
            tags: ['Auth'],
            security: [{ bearerAuth: [] }],
            responses: {
                '200': json('`{ options }`: pass `options` to the browser', {
                    type: 'object',
                    properties: { options: { type: 'object' } }
                }),
                '403': reauth,
                '404': unavailable,
                '409': { description: 'Already 20 passkeys (`PASSKEY_LIMIT`)' }
            }
        }
    },
    '/auth/passkeys/register/verify': {
        post: {
            summary: 'Finish adding a passkey',
            description:
                'The browser’s answer to the options. `name` is optional: by default the passkey is named after where it lives ("iCloud Keychain") or the browser it was made in ("Chrome on Windows").',
            tags: ['Auth'],
            security: [{ bearerAuth: [] }],
            requestBody: body({
                type: 'object',
                required: ['response'],
                properties: { response: browserAnswer, name: { type: 'string', maxLength: 60 } }
            }),
            responses: {
                '201': json('`{ passkey }`: the passkey added', {
                    type: 'object',
                    properties: { passkey: passkeySchema }
                }),
                '400': {
                    description:
                        'Expired or used challenge (`PASSKEY_EXPIRED`), failed check (`PASSKEY_INVALID`), or another page asked (`PASSKEY_ORIGIN`)'
                },
                '404': unavailable,
                '409': {
                    description:
                        'Already on an account (`PASSKEY_EXISTS`), or 20 already (`PASSKEY_LIMIT`)'
                }
            }
        }
    },
    '/auth/passkeys/{passkeyId}': {
        patch: {
            summary: 'Rename a passkey',
            tags: ['Auth'],
            security: [{ bearerAuth: [] }],
            parameters: [idParam],
            requestBody: body({
                type: 'object',
                required: ['name'],
                properties: { name: { type: 'string', maxLength: 60 } }
            }),
            responses: {
                '200': json('`{ passkey }`: the passkey renamed', {
                    type: 'object',
                    properties: { passkey: passkeySchema }
                }),
                '400': { description: 'No name' },
                '404': { description: 'No such passkey on this account' }
            }
        },
        delete: {
            summary: 'Remove a passkey',
            description:
                'Needs a sign-in from the last 10 minutes. Ends the account’s sessions and answers a replacement token for this one, keeping its sign-in time and deadline. The last way to sign in can’t be removed; the email code counts where the server sends one.',
            tags: ['Auth'],
            security: [{ bearerAuth: [] }],
            parameters: [idParam],
            responses: {
                '200': json('`{ token }`: the replacement session token', {
                    type: 'object',
                    required: ['token'],
                    properties: { token: str }
                }),
                '403': reauth,
                '404': { description: 'No such passkey on this account' },
                '409': { description: 'The last way to sign in (`LAST_SIGN_IN_METHOD`)' }
            }
        }
    }
};
