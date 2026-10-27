/**
 * Configuration and shared types for @moteurio/client.
 * Entities (Project, Model, Entry, etc.) are left as generic records so the client
 * can be used without depending on @moteurio/types; consumers can cast or extend.
 */

export type MoteurAuth =
    { type: 'bearer'; token: string } | { type: 'apiKey'; apiKey: string; projectId?: string };

/** Default HTTP timeout in ms when `timeout` is omitted (axios). */
export const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

export interface MoteurClientConfig {
    baseURL: string;
    auth?: MoteurAuth;
    /** Optional preview token header for public channel reads. */
    previewToken?: string;
    /**
     * Per-request timeout in milliseconds. Defaults to {@link DEFAULT_REQUEST_TIMEOUT_MS}.
     * Pass `0` to disable (not recommended in production).
     */
    timeout?: number;
    /**
     * Called with every failed request before it rejects (e.g. to show "out of credits" or "slow
     * down" once for the whole app). Must not throw.
     */
    onError?: (error: import('./client.js').MoteurApiError) => void;
}

/** Public client: API key auth, for one project. */
export type MoteurPublicAuth = { type: 'apiKey'; apiKey: string; projectId?: string };

/** Where the public client reads from when no `baseURL` is given. */
export const DEFAULT_API_URL = 'https://api.moteur.io';

/**
 * A site's key is enough: `createMoteurPublicClient({ apiKey })`. The key's project and channel
 * are asked of the API once, on the first read (`GET /keys/me`).
 */
export interface MoteurPublicClientConfig {
    /** The project key (read-only). Or `auth: { type: 'apiKey', apiKey }`. */
    apiKey?: string;
    auth?: MoteurPublicAuth;
    /** Default `https://api.moteur.io`; set it for a server of your own. */
    baseURL?: string;
    /** Skips asking the API which project the key belongs to. */
    projectId?: string;
    /** What `channel()` reads when given no id. Default: the key's only channel, or `site`. */
    channel?: string;
    /** Same as {@link MoteurClientConfig.timeout}. */
    timeout?: number;
    previewToken?: string;
}

/** What a project key is (`GET /keys/me`). */
export interface KeyInfo {
    projectId: string;
    keyId: string;
    /** The channels it reads. */
    channels: string[];
    /** The one to read when there's no doubt: its only channel, or `site`. */
    channel?: string;
    /** Whether it also reads the sitemap, navigation, urls, breadcrumb and Radar. */
    siteWide: boolean;
}

export interface SignedIn {
    token: string;
    user: Record<string, unknown>;
}

/** Two-step sign-in is on: no session yet. Send the ticket with a code to `verifyTwoFactor`. */
export interface TwoFactorRequired {
    twoFactor: true;
    ticket: string;
}

export type LoginResult = SignedIn | TwoFactorRequired;

export interface ApiError {
    error: string;
    details?: string;
}
