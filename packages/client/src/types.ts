/**
 * Configuration and shared types for @moteurio/client.
 * Entities such as Project, Model and Entry are typed as generic records so the client can be used
 * without depending on @moteurio/types. Consumers can cast or extend them.
 */

export type MoteurAuth =
    { type: 'bearer'; token: string } | { type: 'apiKey'; apiKey: string; projectId?: string };

/** Default HTTP request timeout in milliseconds, used when `timeout` is omitted. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

export interface MoteurClientConfig {
    baseURL: string;
    auth?: MoteurAuth;
    /** Preview token sent with public channel reads. */
    previewToken?: string;
    /**
     * Per-request timeout in milliseconds. Defaults to {@link DEFAULT_REQUEST_TIMEOUT_MS}.
     * Pass `0` to disable (not recommended in production).
     */
    timeout?: number;
    /**
     * Called with every failed request before the promise rejects. Use it, for example, to show an
     * "out of credits" or "slow down" message once for the whole app. It must not throw.
     */
    onError?: (error: import('./client.js').MoteurApiError) => void;
}

/** Authentication for the public client: an API key for a single project. */
export type MoteurPublicAuth = { type: 'apiKey'; apiKey: string; projectId?: string };

/** API URL the public client uses when no `baseURL` is given. */
export const DEFAULT_API_URL = 'https://api.moteur.io';

/**
 * Configuration of the public client. An API key is enough: `createMoteurPublicClient({ apiKey })`.
 * The client looks up the key's project and channel once, on the first read (`GET /keys/me`).
 */
export interface MoteurPublicClientConfig {
    /** The project's read-only API key. Equivalent to `auth: { type: 'apiKey', apiKey }`. */
    apiKey?: string;
    auth?: MoteurPublicAuth;
    /** API base URL. Defaults to `https://api.moteur.io`. Set it when using your own server. */
    baseURL?: string;
    /** Project ID. When set, the client does not look up the key's project from the API. */
    projectId?: string;
    /** Channel that `channel()` reads when called without an ID. Defaults to the key's only channel, or `site`. */
    channel?: string;
    /** See {@link MoteurClientConfig.timeout}. */
    timeout?: number;
    previewToken?: string;
}

/** Information about a project API key, as returned by `GET /keys/me`. */
export interface KeyInfo {
    projectId: string;
    keyId: string;
    /** IDs of the channels the key can read. */
    channels: string[];
    /** The channel to read by default: the key's only channel, or `site`. */
    channel?: string;
    /** True when the key can also read the sitemap, navigation, urls, breadcrumb and Radar endpoints. */
    siteWide: boolean;
}

export interface SignedIn {
    token: string;
    user: Record<string, unknown>;
}

/** Returned when two-factor authentication is enabled and no session exists yet. Send the ticket and an authentication code to `verifyTwoFactor`. */
export interface TwoFactorRequired {
    twoFactor: true;
    ticket: string;
}

export type LoginResult = SignedIn | TwoFactorRequired;

export interface ApiError {
    error: string;
    details?: string;
}
