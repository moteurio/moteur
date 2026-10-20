import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
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
            exp: Math.floor(Date.now() / 1000) + TTL_SECONDS
        })
    ).toString('base64url');
    setCookie(req, res, nonce, TTL_SECONDS);
    return `${body}.${sign(body)}`;
}

/** On the callback: where to go next, or null when `state` is missing, forged, stale or from another browser. */
export function completeOAuth(
    req: OAuthRequest,
    res: OAuthResponse,
    provider: string
): { next: string } | null {
    const state = req.query.state;
    const nonce = readCookie(req);
    setCookie(req, res, '', 0);
    if (typeof state !== 'string' || !nonce) return null;

    const [body, mac] = state.split('.');
    if (!body || !mac) return null;
    const expected = Buffer.from(sign(body));
    const given = Buffer.from(mac);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

    let payload: { p?: unknown; n?: unknown; next?: unknown; exp?: unknown };
    try {
        payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
        return null;
    }
    if (payload.p !== provider || payload.n !== nonce) return null;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now() / 1000) return null;
    return { next: safeNext(payload.next) };
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

/** Back to the app with why it didn't work: `#error=…`. */
export function redirectLoginFailed(res: OAuthResponse, error: OAuthFailure): void {
    res.redirect(appUrl({ error }));
}
