import type { StoredPasskey } from './Passkey.js';

export interface User {
    id: string;
    isActive: boolean;
    email: string;
    name?: string;
    passwordHash?: string;
    /** Public path or absolute URL of the avatar image (for example `/avatars/64/lion.png`). */
    avatar?: string;

    roles: string[];
    projects: string[];
    auth?: Record<string, any>;
    /** Incremented when credentials change. Incrementing it invalidates all existing sessions for the user. */
    authVersion?: number;
    /** ISO 8601 timestamp of the last successful sign-in (password or OAuth). */
    lastLoginAt?: string;
    /**
     * Two-factor authentication settings: the authenticator app secret (encrypted with
     * MOTEUR_ENCRYPTION_KEY), the last time step accepted (so a code cannot be used twice), and
     * recovery codes stored as SHA-256 digests. Never returned by the API.
     */
    twoFactor?: { secret: string; lastStep?: number; enabledAt: string; recoveryCodes: string[] };
    /** Secret issued during two-factor setup. It stays here until the user confirms it with a first valid code. Never returned by the API. */
    twoFactorPending?: { secret: string; createdAt: string };
    /** Passkeys (WebAuthn credentials) registered for signing in. Never returned by the API in this form. */
    passkeys?: StoredPasskey[];
    /**
     * Random base64url handle that passkeys use to identify this account. It is generated when the
     * first passkey is registered and differs from the account id, so authenticators store nothing
     * that identifies the user. Never returned by the API.
     */
    passkeyUserId?: string;
    /**
     * Set when an agent (an AI client such as Claude) makes the request on this user's behalf.
     * Derived from the access token and never stored. When set, `name` reads "<name> via <agent>".
     */
    agent?: AgentActor;
    /** How the account was created, plus the page and campaign that led to the sign-up (attribution). */
    signup?: SignupRecord;
    /** The user's stated purpose for signing up and their progress through onboarding. */
    onboarding?: OnboardingState;
    /** The user's theme, language and email preferences. The server uses them for the emails it sends. */
    preferences?: UserPreferences;
}

/** User choices stored on the server so that outgoing emails can follow them. */
export interface UserPreferences {
    /** Interface theme: `discotheque` or `folio`. */
    look?: 'discotheque' | 'folio';
    /** Interface language code (`en`, `fr`, ...). Emails use it when the server has a translation for it. */
    locale?: string;
    /** Notification email categories. A value of `false` turns that category off. Sign-in emails cannot be turned off. */
    emails?: { reviews?: boolean; usage?: boolean };
}

/** The purpose a user selected on the first onboarding screen. */
export type OnboardingIntent = 'agency' | 'own' | 'developer' | 'team';

export interface OnboardingState {
    intent?: OnboardingIntent;
    /** ID of the user's copy of the demo project. Set when they request a tour. */
    demoProjectId?: string;
    /** Number of demo project copies the user has created. The server limits this count. */
    demoCopies?: number;
    /** ISO 8601 timestamp of when the user finished or skipped onboarding. */
    finishedAt?: string;
}

export interface SignupRecord {
    at: string;
    method: 'email' | 'provider' | 'invite';
    /** Marketing site page the user came from (for example `/for/agencies`). */
    from?: string;
    /** Goal parameter on the sign-up link (for example `start` or `agency-demo`). */
    goal?: string;
    /** `utm_*` query parameters from the visit, keyed without the `utm_` prefix. */
    campaign?: Record<string, string>;
    locale?: string;
    /** Set when `method` is `invite`: who sent the invite and the project or workspace it was for. */
    invite?: { by: string; projectId?: string; workspaceId?: string };
}

/** An agent acting on behalf of a user. */
export interface AgentActor {
    /** Name the agent identifies itself with, such as "Claude" or "claude-code". */
    name: string;
    /** When true, the agent's changes go live only after a person approves or publishes them. Defaults to true. */
    reviewOnly: boolean;
}

/**
 * Public member row returned by `GET /projects/:projectId/users`. It omits `passwordHash`, `auth`
 * and `projects`. `online` is derived from presence heartbeats sent by admin clients; the idle
 * window is set by `ONLINE_PRESENCE_MAX_IDLE_MS` on the API host.
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
    /** The user's role in the project's workspace. Absent when they are not a workspace member (for example a client). */
    workspaceRole?: 'owner' | 'admin' | 'billing' | 'member';
    /**
     * True when the user has access only through the workspace and is not listed on the project
     * itself. Such a user loses access by leaving the workspace or, if they are a Member, by being
     * given access to chosen projects only.
     */
    viaWorkspace: boolean;
}
