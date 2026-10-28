import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { URL, URLSearchParams } from 'url';

/**
 * The round trip of an OAuth sign-in, shared by auth provider plugins:
 * `beginOAuth` before sending someone to the provider, `completeOAuth` when they come back,
 * then `redirectAfterLogin` (or `redirectLoginFailed`) to the app in `AUTH_REDIRECT_AFTER_LOGIN`.
 *
 * `state` is signed with a key derived from `JWT_SECRET` and tied to a short-lived cookie, so a
 * callback only completes in the browser that started it. The token travels in the URL fragment,
 * which browsers never send to servers or in a Referer.
 */

type OAuthRequest = {
    headers: Record<string, string | string[] | undefined>;
    query: Record<string, unknown>;
    secure?: boolean;
};

type OAuthResponse = {
    setHeader(name: string, value: string | string[]): unknown;
    redirect(url: string): void;
};

export type OAuthFailure = 'state' | 'email' | 'inactive' | 'failed';

const COOKIE = 'moteur_oauth';
const TTL_SECONDS = 10 * 60;

function stateKey(): Buffer {
    const secret = process.env.JWT_SECRET?.trim();
    if (!secret) throw new Error('JWT_SECRET must be set to sign OAuth state.');
    return createHmac('sha256', secret).update('moteur-oauth-state').digest();
}

function sign(body: string): string {
    return createHmac('sha256', stateKey()).update(body).digest('base64url');
}

function isHttps(req: OAuthRequest): boolean {
    const proto = req.headers['x-forwarded-proto'];
    return (
        Boolean(req.secure) || (typeof proto === 'string' && proto.split(',')[0].trim() === 'https')
    );
}

function setCookie(req: OAuthRequest, res: OAuthResponse, value: string, maxAge: number): void {
    const parts = [`${COOKIE}=${value}`, 'Path=/', `Max-Age=${maxAge}`, 'HttpOnly', 'SameSite=Lax'];
    if (isHttps(req)) parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
}

function readCookie(req: OAuthRequest): string | null {
    const header = req.headers.cookie;
    const raw = Array.isArray(header) ? header.join('; ') : (header ?? '');
    for (const part of raw.split(';')) {
        const [name, ...rest] = part.trim().split('=');
        if (name === COOKIE) return rest.join('=');
    }
    return null;
}

export type OAuthConfig = { clientId: string; clientSecret: string; redirectUri: string };

const OFF = new Set(['0', 'false', 'off', 'no']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function httpUrl(value: string): URL | null {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
    } catch {
        return null;
    }
}

/**
 * A provider's settings from `AUTH_<PROVIDER>_CLIENT_ID`, `_CLIENT_SECRET` and `_REDIRECT_URI`, or why
 * it can't be offered: `off` when turned off with `AUTH_<PROVIDER>_ENABLED=false` or left unset,
 * otherwise what is wrong with the settings.
 */
export function readOAuthConfig(
    provider: string
): { config: OAuthConfig } | { off: true } | { problem: string } {
    const prefix = `AUTH_${provider.toUpperCase()}_`;
    const env = (name: string) => process.env[prefix + name]?.trim() ?? '';
    if (OFF.has(env('ENABLED').toLowerCase())) return { off: true };

    const clientId = env('CLIENT_ID');
    const clientSecret = env('CLIENT_SECRET');
    const redirectUri = env('REDIRECT_URI');
    if (!clientId && !clientSecret && !redirectUri) return { off: true };

    const missing = (['CLIENT_ID', 'CLIENT_SECRET', 'REDIRECT_URI'] as const).filter(n => !env(n));
    if (missing.length) return { problem: `${missing.map(n => prefix + n).join(', ')} not set` };
    if (/\s/.test(clientId) || /\s/.test(clientSecret)) {
        return { problem: `${prefix}CLIENT_ID or ${prefix}CLIENT_SECRET contains spaces` };
    }

    const callback = httpUrl(redirectUri);
    if (!callback || callback.hash) {
        return { problem: `${prefix}REDIRECT_URI must be an absolute http(s) URL` };
    }
    if (!callback.pathname.endsWith(`/auth/${provider}/callback`)) {
        return { problem: `${prefix}REDIRECT_URI must end with /auth/${provider}/callback` };
    }
    if (callback.protocol === 'http:' && !LOCAL_HOSTS.has(callback.hostname)) {
        return { problem: `${prefix}REDIRECT_URI must use https outside localhost` };
    }

    if (!process.env.JWT_SECRET?.trim()) return { problem: 'JWT_SECRET not set' };
    const after = process.env.AUTH_REDIRECT_AFTER_LOGIN?.trim() ?? '';
    if (!after) return { problem: 'AUTH_REDIRECT_AFTER_LOGIN not set' };
    if (!httpUrl(after) && !safeNext(after)) {
        return { problem: 'AUTH_REDIRECT_AFTER_LOGIN must be an http(s) URL or a path' };
    }

    return { config: { clientId, clientSecret, redirectUri } };
}

const warned = new Set<string>();

/** The provider's settings when it can be offered, else null; a misconfiguration is logged once. */
export function oauthConfig(provider: string): OAuthConfig | null {
    const read = readOAuthConfig(provider);
    if ('config' in read) return read.config;
    if ('problem' in read && !warned.has(provider)) {
        warned.add(provider);
        console.warn(`[auth] ${provider} sign-in is hidden: ${read.problem}.`);
    }
    return null;
}

/** A path inside the app to land on after signing in; anything else (other sites, `//host`) is dropped. */
export function safeNext(next: unknown): string {
    if (typeof next !== 'string' || next.length > 2048) return '';
    if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '';
    return next;
}

/** Before redirecting to the provider: the `state` to send, with `?next=` from the request kept inside. */
export function beginOAuth(req: OAuthRequest, res: OAuthResponse, provider: string): string {
    const nonce = randomBytes(18).toString('base64url');
    const body = Buffer.from(
        JSON.stringify({
            p: provider,
            n: nonce,
            next: safeNext(req.query.next),
            link: req.query.link === '1' ? true : undefined,
            exp: Math.floor(Date.now() / 1000) + TTL_SECONDS
        })
    ).toString('base64url');
    setCookie(req, res, nonce, TTL_SECONDS);
    return `${body}.${sign(body)}`;
}

/**
 * PKCE: the verifier is a keyed hash of the browser's nonce, so it never travels in a URL, and a
 * code taken from one sign-in can't be redeemed in another browser's.
 */
function verifierFor(nonce: string): string {
    return createHmac('sha256', stateKey()).update(`pkce:${nonce}`).digest('base64url');
}

/** The `code_challenge` (method S256) to send with this `state` to the provider. */
export function oauthChallenge(state: string): string {
    const body = state.split('.')[0] ?? '';
    const { n } = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { n: string };
    return createHash('sha256').update(verifierFor(n)).digest('base64url');
}

/** On the callback: where to go next, or null when `state` is missing, forged, stale or from another browser. */
export function completeOAuth(
    req: OAuthRequest,
    res: OAuthResponse,
    provider: string
): { next: string; link?: true; verifier: string } | null {
    const state = req.query.state;
    const nonce = readCookie(req);
    setCookie(req, res, '', 0);
    if (typeof state !== 'string' || !nonce) return null;

    const [body, mac] = state.split('.');
    if (!body || !mac) return null;
    const expected = Buffer.from(sign(body));
    const given = Buffer.from(mac);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

    let payload: { p?: unknown; n?: unknown; next?: unknown; exp?: unknown; link?: unknown };
    try {
        payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
        return null;
    }
    if (payload.p !== provider || payload.n !== nonce) return null;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now() / 1000) return null;
    return {
        next: safeNext(payload.next),
        ...(payload.link === true ? { link: true as const } : {}),
        // The `code_verifier` for the token request.
        verifier: verifierFor(nonce)
    };
}

function appUrl(params: Record<string, string>): string {
    const base = process.env.AUTH_REDIRECT_AFTER_LOGIN?.trim() || '/auth/callback';
    const query = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v) as [string, string][]
    );
    return `${base.split('#')[0]}#${query.toString()}`;
}

/** Back to the app, signed in: `#token=…&next=…`. */
export function redirectAfterLogin(res: OAuthResponse, token: string, next = ''): void {
    res.redirect(appUrl({ token, next }));
}

/** Keep pending identity proofs bound to the browser that completed OAuth. */
export function redirectProviderSignIn(
    req: OAuthRequest,
    res: OAuthResponse,
    result:
        | { token: string }
        | { pending: { ticket: string; browserToken: string } }
        | { twoFactor: { ticket: string } },
    next = ''
): void {
    if ('token' in result) return redirectAfterLogin(res, result.token, next);
    // Two-step sign-in: the app asks for a code, then trades it with the ticket for a session.
    if ('twoFactor' in result)
        return void res.redirect(appUrl({ two_factor: result.twoFactor.ticket, next }));
    const secure = isHttps(req);
    const flags = `Path=/; HttpOnly; ${secure ? 'Secure; ' : ''}`;
    res.setHeader('Set-Cookie', [
        `${COOKIE}=; ${flags}Max-Age=0; SameSite=Lax`,
        `moteur_provider=${result.pending.browserToken}; ${flags}Max-Age=600; SameSite=${secure ? 'None' : 'Lax'}`
    ]);
    res.redirect(appUrl({ provider_ticket: result.pending.ticket, next }));
}

/** Back to the app with why it didn't work: `#error=…`. */
export function redirectLoginFailed(res: OAuthResponse, error: OAuthFailure): void {
    res.redirect(appUrl({ error }));
}

export type OidcDiscovery = {
    authorization_endpoint: string;
    token_endpoint: string;
    userinfo_endpoint?: string;
    issuer?: string;
};

/** Load OIDC metadata from `{issuer}/.well-known/openid-configuration`. */
export async function discoverOidcIssuer(issuer: string): Promise<OidcDiscovery> {
    const base = issuer.replace(/\/$/, '');
    const res = await fetch(`${base}/.well-known/openid-configuration`);
    if (!res.ok) {
        throw new Error(`OIDC discovery failed (${res.status}) for ${base}`);
    }
    const doc = (await res.json()) as Record<string, unknown>;
    if (doc.issuer !== issuer)
        throw new Error('OIDC discovery issuer does not match configuration');
    const authorization_endpoint = doc.authorization_endpoint;
    const token_endpoint = doc.token_endpoint;
    if (typeof authorization_endpoint !== 'string' || typeof token_endpoint !== 'string') {
        throw new Error('OIDC discovery document is missing authorization or token endpoint');
    }
    for (const endpoint of [authorization_endpoint, token_endpoint, doc.userinfo_endpoint]) {
        if (
            endpoint != null &&
            (typeof endpoint !== 'string' || new URL(endpoint).protocol !== 'https:')
        ) {
            throw new Error('OIDC endpoints must use HTTPS');
        }
    }
    return {
        authorization_endpoint,
        token_endpoint,
        userinfo_endpoint:
            typeof doc.userinfo_endpoint === 'string' ? doc.userinfo_endpoint : undefined,
        issuer: typeof doc.issuer === 'string' ? doc.issuer : base
    };
}

/** Authorization-code grant at an OIDC/OAuth2 token endpoint. */
export async function exchangeAuthorizationCode(
    tokenUrl: string,
    config: OAuthConfig,
    code: string,
    /** `completeOAuth`'s verifier, when the sign-in sent `oauthChallenge(state)`. */
    verifier?: string
): Promise<{ access_token: string; id_token?: string }> {
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        code,
        ...(verifier && { code_verifier: verifier })
    });
    const res = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
        const err = typeof data.error === 'string' ? data.error : res.statusText;
        throw new Error(`Token exchange failed: ${err}`);
    }
    const access_token = data.access_token;
    if (typeof access_token !== 'string' || !access_token) {
        throw new Error('Token response missing access_token');
    }
    return {
        access_token,
        id_token: typeof data.id_token === 'string' ? data.id_token : undefined
    };
}

/** Userinfo GET with bearer token (OIDC). */
export async function fetchOidcUserInfo(
    userInfoUrl: string,
    accessToken: string
): Promise<Record<string, unknown>> {
    const res = await fetch(userInfoUrl, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
    });
    if (!res.ok) throw new Error(`Userinfo failed (${res.status})`);
    return (await res.json()) as Record<string, unknown>;
}

/** Parse JWT payload without signature verification (use only after token endpoint trust). */
export function parseJwtPayload(idToken: string): Record<string, unknown> | null {
    const parts = idToken.split('.');
    if (parts.length < 2) return null;
    try {
        return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<
            string,
            unknown
        >;
    } catch {
        return null;
    }
}

/** Only an explicit verified-email claim proves ownership; usernames are not emails. */
export function emailFromOidcClaims(claims: Record<string, unknown>): string | null {
    const email = claims.email;
    if (typeof email === 'string' && email.trim()) {
        const verified = claims.email_verified;
        if (verified !== true) return null;
        return email.trim();
    }
    return null;
}
