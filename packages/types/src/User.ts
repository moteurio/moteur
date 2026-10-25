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
     * Set when an agent (an AI client such as Claude) makes the request on this person's behalf.
     * Comes from the token, never stored: `name` then reads "Louise via Claude".
     */
    agent?: AgentActor;
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
