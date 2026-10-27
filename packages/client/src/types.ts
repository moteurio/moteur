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

/** Public client: API key auth with a fixed project id (required). */
export type MoteurPublicAuth = { type: 'apiKey'; apiKey: string; projectId: string };

export interface MoteurPublicClientConfig {
    baseURL: string;
    auth: MoteurPublicAuth;
    /** Same as {@link MoteurClientConfig.timeout}. */
    timeout?: number;
    previewToken?: string;
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
