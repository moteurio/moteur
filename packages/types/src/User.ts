import type { StoredPasskey } from './Passkey.js';

export interface User {
    id: string;
    isActive: boolean;
    email: string;
    name?: string;
    passwordHash?: string;
    /** Public path or absolute URL served by the frontend (e.g. `/avatars/64/lion.png`). */
    avatar?: string;

    roles: string[];
    projects: string[];
    auth?: Record<string, any>;
    /** Incremented when credentials change; invalidates all previous user sessions. */
    authVersion?: number;
    /** ISO 8601 — updated on successful sign-in (password or OAuth). */
    lastLoginAt?: string;
    /**
     * Two-step sign-in: an authenticator app's secret (sealed with MOTEUR_ENCRYPTION_KEY), the
     * last code step used (no code works twice), and recovery codes as SHA-256 digests. Never sent.
     */
    twoFactor?: { secret: string; lastStep?: number; enabledAt: string; recoveryCodes: string[] };
    /** A secret shown to set two-step sign-in up, until a first code confirms it. Never sent. */
    twoFactorPending?: { secret: string; createdAt: string };
    /** Passkeys (WebAuthn credentials) that sign this person in. Never sent as they are. */
    passkeys?: StoredPasskey[];
    /**
     * The random handle passkeys know this account by (base64url), made with the first one: not
     * the account id, so an authenticator holds nothing that names the person. Never sent.
     */
    passkeyUserId?: string;
    /**
     * Set when an agent (an AI client such as Claude) makes the request on this person's behalf.
     * Comes from the token, never stored: `name` then reads "Louise via Claude".
     */
    agent?: AgentActor;
    /** How the account was made, and the page and campaign that brought them (attribution). */
    signup?: SignupRecord;
    /** What they said they came for, and how far they are in getting started. */
    onboarding?: OnboardingState;
    /** Their look, language and which emails they want, for what the server sends them. */
    preferences?: UserPreferences;
}

/** What a person chose, kept on the server so its emails can follow it. */
export interface UserPreferences {
    /** `discotheque` or `folio`. */
    look?: 'discotheque' | 'folio';
    /** Interface language (`en`, `fr`…): their emails use it when the server has it. */
    locale?: string;
    /** Notification emails they turned off (`false`). Sign-in mail can't be turned off. */
    emails?: { reviews?: boolean };
}

/** Why someone came, as they said on their first screen. */
export type OnboardingIntent = 'agency' | 'own' | 'developer' | 'team';

export interface OnboardingState {
    intent?: OnboardingIntent;
    /** Their copy of the demo project, once they asked to be shown around. */
    demoProjectId?: string;
    /** Demo copies they have made (a few at most). */
    demoCopies?: number;
    /** When they finished (or skipped) the welcome screens. */
    finishedAt?: string;
}

export interface SignupRecord {
    at: string;
    method: 'email' | 'provider' | 'invite';
    /** The site page they came from (`/for/agencies`). */
    from?: string;
    /** The site's goal on that link (`start`, `agency-demo`). */
    goal?: string;
    /** `utm_*` from the visit, without the prefix. */
    campaign?: Record<string, string>;
    locale?: string;
}

/** An agent acting for a person. */
export interface AgentActor {
    /** What the agent calls itself: "Claude", "claude-code"… */
    name: string;
    /** Changes it makes go live only once a person approves or publishes them (default true). */
    reviewOnly: boolean;
}

/**
 * Public member row from `GET /projects/:projectId/users` (no `passwordHash`, `auth`, or `projects`).
 * `online` uses Studio presence heartbeats; window length is configurable via `ONLINE_PRESENCE_MAX_IDLE_MS` on the API host.
 */
export interface ProjectMemberUser {
    id: string;
    email: string;
    name?: string;
    avatar?: string;
    roles: string[];
    isActive: boolean;
    lastLoginAt?: string;
    online: boolean;
}
