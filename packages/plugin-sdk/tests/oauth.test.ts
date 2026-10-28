import { createHash } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    beginOAuth,
    completeOAuth,
    oauthChallenge,
    oauthConfig,
    readOAuthConfig,
    redirectAfterLogin,
    redirectLoginFailed,
    safeNext
} from '../src/oauth';
import { emailFromOidcClaims, discoverOidcIssuer } from '../src/oauth';
import { redirectProviderSignIn } from '../src/oauth';

describe('OIDC identity evidence', () => {
    afterEach(() => vi.unstubAllGlobals());
    it.each([
        { email: 'victim@example.test' },
        { email: 'victim@example.test', email_verified: false },
        { preferred_username: 'victim@example.test' },
        { mail: 'victim@example.test' },
        { upn: 'victim@example.test' }
    ])('refuses claims without verified email ownership: %j', claims => {
        expect(emailFromOidcClaims(claims)).toBeNull();
    });
    it('accepts an explicitly verified email', () => {
        expect(emailFromOidcClaims({ email: ' owner@example.test ', email_verified: true })).toBe(
            'owner@example.test'
        );
    });
    it('rejects discovery metadata for a different issuer', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ issuer: 'https://other.test' })
            })
        );
        await expect(discoverOidcIssuer('https://expected.test')).rejects.toThrow('issuer');
    });
});

function response() {
    const res = {
        headers: {} as Record<string, string | string[]>,
        location: '',
        setHeader(name: string, value: string | string[]) {
            res.headers[name.toLowerCase()] = value;
        },
        redirect(url: string) {
            res.location = url;
        }
    };
    return res;
}

/** Start a sign-in, then come back with what the provider echoes and the cookie it left. */
function roundTrip(next?: string, provider = 'github') {
    const start = response();
    const state = beginOAuth({ headers: {}, query: next ? { next } : {} }, start, provider);
    const cookie = String(start.headers['set-cookie']).split(';')[0];
    return { state, cookie, start };
}

describe('OAuth state', () => {
    beforeEach(() => {
        vi.stubEnv('JWT_SECRET', 'test-secret');
        vi.stubEnv('AUTH_REDIRECT_AFTER_LOGIN', 'https://studio.example/auth/callback');
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.useRealTimers();
    });
    it('keeps explicit link intent in signed state and binds the continuation to an HttpOnly cookie', () => {
        const start = response();
        const state = beginOAuth(
            { headers: {}, query: { link: '1', next: '/account/security' } },
            start,
            'google'
        );
        const cookie = String(start.headers['set-cookie']).split(';')[0];
        expect(
            completeOAuth({ headers: { cookie }, query: { state } }, response(), 'google')
        ).toEqual({ next: '/account/security', link: true, verifier: expect.any(String) });
        const out = response();
        redirectProviderSignIn({ headers: {}, query: {}, secure: true }, out, {
            pending: { ticket: 'public-ticket', browserToken: 'private-browser-proof' }
        });
        expect(out.location).toContain('provider_ticket=public-ticket');
        expect(out.location).not.toContain('private-browser-proof');
        expect(out.headers['set-cookie']).toContainEqual(
            expect.stringContaining('HttpOnly; Secure; Max-Age=600; SameSite=None')
        );
    });

    it('completes in the browser that started it, keeping next', () => {
        const { state, cookie, start } = roundTrip('/projects/atelier');
        expect(String(start.headers['set-cookie'])).toMatch(/HttpOnly; SameSite=Lax/);
        const back = response();
        expect(completeOAuth({ headers: { cookie }, query: { state } }, back, 'github')).toEqual({
            next: '/projects/atelier',
            verifier: expect.any(String)
        });
        expect(String(back.headers['set-cookie'])).toMatch(/Max-Age=0/);
    });

    it('proves the code with PKCE: the challenge sent is the hash of the verifier given back', () => {
        const { state, cookie } = roundTrip('/projects/atelier');
        const done = completeOAuth({ headers: { cookie }, query: { state } }, response(), 'github');
        expect(done?.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(state).not.toContain(done!.verifier);
        expect(oauthChallenge(state)).toBe(
            createHash('sha256').update(done!.verifier).digest('base64url')
        );
        // Another sign-in, another verifier.
        const other = roundTrip('/projects/atelier');
        expect(oauthChallenge(other.state)).not.toBe(oauthChallenge(state));
    });

    it('refuses a callback without the cookie (another browser)', () => {
        const { state } = roundTrip();
        expect(completeOAuth({ headers: {}, query: { state } }, response(), 'github')).toBeNull();
    });

    it('refuses a state from another sign-in', () => {
        const first = roundTrip();
        const second = roundTrip();
        expect(
            completeOAuth(
                { headers: { cookie: second.cookie }, query: { state: first.state } },
                response(),
                'github'
            )
        ).toBeNull();
    });

    it('refuses a tampered state', () => {
        const { state, cookie } = roundTrip('/a');
        const [body, mac] = state.split('.');
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
        const forged = Buffer.from(JSON.stringify({ ...payload, next: '/b' })).toString(
            'base64url'
        );
        expect(
            completeOAuth(
                { headers: { cookie }, query: { state: `${forged}.${mac}` } },
                response(),
                'github'
            )
        ).toBeNull();
    });

    it('refuses a state meant for another provider', () => {
        const { state, cookie } = roundTrip(undefined, 'google');
        expect(
            completeOAuth({ headers: { cookie }, query: { state } }, response(), 'github')
        ).toBeNull();
    });

    it('refuses a state older than ten minutes', () => {
        vi.useFakeTimers();
        const { state, cookie } = roundTrip();
        vi.advanceTimersByTime(11 * 60 * 1000);
        expect(
            completeOAuth({ headers: { cookie }, query: { state } }, response(), 'github')
        ).toBeNull();
    });

    it('marks the cookie Secure behind an https proxy', () => {
        const res = response();
        beginOAuth({ headers: { 'x-forwarded-proto': 'https' }, query: {} }, res, 'github');
        expect(String(res.headers['set-cookie'])).toMatch(/; Secure$/);
    });
});

describe('safeNext', () => {
    it('keeps paths inside the app only', () => {
        expect(safeNext('/projects/a?tab=1')).toBe('/projects/a?tab=1');
        expect(safeNext('https://evil.example')).toBe('');
        expect(safeNext('//evil.example')).toBe('');
        expect(safeNext('/\\evil.example')).toBe('');
        expect(safeNext(42)).toBe('');
    });
});

describe('redirects back to the app', () => {
    beforeEach(() =>
        vi.stubEnv('AUTH_REDIRECT_AFTER_LOGIN', 'https://studio.example/auth/callback')
    );
    afterEach(() => vi.unstubAllEnvs());

    it('puts the token in the fragment, never the query', () => {
        const res = response();
        redirectAfterLogin(res, 'tok', '/projects');
        expect(res.location).toBe(
            'https://studio.example/auth/callback#token=tok&next=%2Fprojects'
        );
    });

    it('says why a sign-in failed', () => {
        const res = response();
        redirectLoginFailed(res, 'email');
        expect(res.location).toBe('https://studio.example/auth/callback#error=email');
    });
});

describe('OAuth provider settings', () => {
    beforeEach(() => {
        vi.stubEnv('JWT_SECRET', 'test-secret');
        vi.stubEnv('AUTH_REDIRECT_AFTER_LOGIN', 'https://studio.example/auth/callback');
        vi.stubEnv('AUTH_GITHUB_ENABLED', '');
        vi.stubEnv('AUTH_GITHUB_CLIENT_ID', 'id');
        vi.stubEnv('AUTH_GITHUB_CLIENT_SECRET', 'secret');
        vi.stubEnv('AUTH_GITHUB_REDIRECT_URI', 'https://api.example/auth/github/callback');
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it('offers a provider set up correctly', () => {
        expect(readOAuthConfig('github')).toEqual({
            config: {
                clientId: 'id',
                clientSecret: 'secret',
                redirectUri: 'https://api.example/auth/github/callback'
            }
        });
    });

    it('is off when turned off or not set up at all', () => {
        vi.stubEnv('AUTH_GITHUB_ENABLED', 'false');
        expect(readOAuthConfig('github')).toEqual({ off: true });
        vi.stubEnv('AUTH_GITHUB_ENABLED', '');
        vi.stubEnv('AUTH_GITHUB_CLIENT_ID', '');
        vi.stubEnv('AUTH_GITHUB_CLIENT_SECRET', '');
        vi.stubEnv('AUTH_GITHUB_REDIRECT_URI', '');
        expect(readOAuthConfig('github')).toEqual({ off: true });
    });

    it.each([
        ['a missing secret', 'AUTH_GITHUB_CLIENT_SECRET', ''],
        ['a relative callback', 'AUTH_GITHUB_REDIRECT_URI', '/auth/github/callback'],
        [
            'another provider’s callback',
            'AUTH_GITHUB_REDIRECT_URI',
            'https://api.example/auth/google/callback'
        ],
        [
            'a plain-http callback in production',
            'AUTH_GITHUB_REDIRECT_URI',
            'http://api.example/auth/github/callback'
        ],
        ['no JWT secret', 'JWT_SECRET', ''],
        ['nowhere to land', 'AUTH_REDIRECT_AFTER_LOGIN', ''],
        ['a bad landing address', 'AUTH_REDIRECT_AFTER_LOGIN', 'studio.example/auth/callback']
    ])('is hidden with %s', (_, name, value) => {
        vi.stubEnv(name, value);
        expect(readOAuthConfig('github')).toHaveProperty('problem');
    });

    it('allows a plain-http callback on localhost', () => {
        vi.stubEnv(
            'AUTH_GITHUB_REDIRECT_URI',
            'http://localhost:5173/moteur-api/auth/github/callback'
        );
        expect(readOAuthConfig('github')).toHaveProperty('config');
    });

    it('logs a misconfiguration once, and nothing when turned off', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.stubEnv('AUTH_GITHUB_ENABLED', 'off');
        expect(oauthConfig('github')).toBeNull();
        expect(warn).not.toHaveBeenCalled();
        vi.stubEnv('AUTH_GITHUB_ENABLED', '');
        vi.stubEnv('AUTH_GITHUB_CLIENT_SECRET', '');
        expect(oauthConfig('github')).toBeNull();
        expect(oauthConfig('github')).toBeNull();
        expect(warn).toHaveBeenCalledTimes(1);
    });
});
