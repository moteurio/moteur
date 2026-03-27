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
    /** ISO 8601 — updated on successful sign-in (password or OAuth). */
    lastLoginAt?: string;
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
