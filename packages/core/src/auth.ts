import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import jwt, { JwtPayload, Secret, SignOptions } from 'jsonwebtoken';

import {
    createUser,
    getUserByEmail,
    getUserById,
    listUsers,
    reloadUsers,
    recordUserLogin
} from './users.js';
import { createAuthSession, requireAuthSession, type AuthSession } from './authSessions.js';
import { getProjectIdsForUser } from './projects.js';
import { hasRole } from '@moteurio/types';
import type { AgentActor, User } from '@moteurio/types/User.js';

const JWT_EXPIRES_IN = process.env.JWT_EXPIRY ?? '1h';

function getJwtSecret(): string {
    const secret = process.env.JWT_SECRET?.trim();
    if (!secret) {
        throw new Error(
            'JWT_SECRET must be set in environment. Do not use a default in production.'
        );
    }
    return secret;
}

/** One rule wherever a password is set or checked, so any password that can be set can sign in. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 200;

/** Why a new password can't be used, or null when it can. */
export function passwordProblem(password: string): string | null {
    if (password.length < PASSWORD_MIN_LENGTH)
        return `The password needs at least ${PASSWORD_MIN_LENGTH} characters`;
    if (password.length > PASSWORD_MAX_LENGTH)
        return `The password can have at most ${PASSWORD_MAX_LENGTH} characters`;
    return null;
}

/** Hash a password for storage in users.json (bcrypt cost factor 10). */
export async function hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, 10);
}

export async function loginUser(
    email: string,
    password: string
): Promise<{ token: string; user: User }> {
    if (!email || !password) {
        throw new Error('Missing email or password');
    }

    // CLI (or another process) may write users.json; this process keeps an in-memory cache — reload so login sees latest users/passwords.
    reloadUsers();
    const user = getUserByEmail(email);
    // If user is not found, throw an error
    if (!user) {
        throw new Error('Invalid credentials');
    }
    const isValid = await bcrypt.compare(password, user.passwordHash as string);
    if (!isValid) {
        throw new Error('Invalid credentials');
    }
    if (!user.isActive) {
        throw new Error('User is not active');
    }

    const loginAt = await recordUserLogin(user.id);
    const displayUser: User = {
        ...user,
        ...(loginAt ? { lastLoginAt: loginAt } : {}),
        projects: getProjectIdsForUser(user.id)
    };
    return {
        token: generateJWT(displayUser),
        user: displayUser
    };
}

/** Someone an OAuth provider vouches for. Only pass an address the provider has verified. */
export type ProviderIdentity = {
    /** Stored under `user.auth`, e.g. `{ githubId: 123 }`. */
    auth: Record<string, string | number>;
    /** Empty is allowed only when this provider identity is already linked. */
    email: string;
    /** Unverified provider hint for the verification UI; never used for account lookup. */
    suggestedEmail?: string;
    name?: string;
};

/**
 * Sign in by the stored provider identity. Never link an existing account by email alone.
 * `onNewUser` runs once for a new account (onboarding); a disabled account is refused.
 */
export async function loginWithProvider(
    identity: ProviderIdentity,
    onNewUser?: (user: User) => Promise<void>
): Promise<{ token: string; user: User; isNew: boolean }> {
    const email = identity.email.trim();

    reloadUsers();
    const identifiers = Object.entries(identity.auth);
    if (
        identifiers.length === 0 ||
        identifiers.some(
            ([, value]) => !['string', 'number'].includes(typeof value) || !String(value).trim()
        )
    )
        throw new Error('The provider gave no stable identity');
    const matches = listUsers().filter(candidate =>
        identifiers.every(([key, value]) => candidate.auth?.[key] === value)
    );
    if (matches.length > 1) throw new Error('Provider identity is linked to multiple accounts');
    let user = matches[0];
    const isNew = !user;
    if (!user) {
        if (!email) throw new Error('The provider gave no verified email address');
        if (listUsers().some(candidate => candidate.email?.toLowerCase() === email.toLowerCase())) {
            throw new Error('Sign in with your existing method to link this provider');
        }
        user = await createUser({
            id: `user:${randomUUID()}`,
            isActive: true,
            email: email.toLowerCase(),
            name: identity.name?.trim() || email,
            roles: [],
            auth: identity.auth,
            projects: []
        });
        if (onNewUser) await onNewUser(user);
    }
    if (!user.isActive) {
        throw new Error('User is not active');
    }

    const loginAt = await recordUserLogin(user.id);
    const displayUser: User = {
        ...user,
        ...(loginAt ? { lastLoginAt: loginAt } : {}),
        projects: getProjectIdsForUser(user.id)
    };
    return { token: generateJWT(displayUser), user: displayUser, isNew };
}

export function generateJWT(user: User): string {
    return tokenForSession(user, createAuthSession(user));
}

/** Credential maintenance rotates tokens without resetting the original authentication time. */
export function rotatePersonalSession(user: User, previous: AuthSession): string {
    if (
        previous.kind !== 'person' ||
        previous.userId !== user.id ||
        previous.expiresAt <= Date.now()
    )
        throw new Error('Sign in again');
    return tokenForSession(
        user,
        createAuthSession(user, previous.expiresAt - Date.now(), {
            kind: 'person',
            authenticatedAt: previous.authenticatedAt
        })
    );
}

function tokenForSession(user: User, session: AuthSession, ttlSeconds?: number): string {
    const secret = getJwtSecret();
    const projects = getProjectIdsForUser(user.id);
    const payload: JwtPayload = {
        sub: user.id,
        id: user.id,
        email: user.email,
        name: user.name ?? user.email,
        roles: user.roles,
        projects,
        isActive: user.isActive,
        sid: session.id,
        auth_time: Math.floor(session.authenticatedAt / 1000),
        authVersion: session.version,
        ...(user.avatar ? { avatarUrl: user.avatar } : {}),
        ...(user.agent ? { agent: user.agent } : {})
    };
    const token: string = jwt.sign(
        payload,
        secret as Secret,
        { expiresIn: ttlSeconds ?? JWT_EXPIRES_IN } as SignOptions
    );
    const claims = jwt.decode(token) as JwtPayload;
    const deadline = Math.floor(session.expiresAt / 1000);
    if (claims.exp! > deadline)
        return jwt.sign({ ...claims, exp: deadline }, secret as Secret, { algorithm: 'HS256' });
    return token;
}

/** Generate a short-lived session token (e.g. for web Atelier). TTL in seconds; max 8 hours. */
export function generateSessionToken(
    user: User,
    ttlSeconds: number,
    parentPayload?: JwtPayload
): string {
    const capped = Math.min(Math.max(ttlSeconds, 60), 8 * 60 * 60); // 1 min to 8h
    const parent = parentPayload
        ? requireAuthSession(parentPayload.sid, user.id, user.authVersion ?? 0)
        : undefined;
    if (
        parent &&
        ((parent.kind === 'agent' && user.agent) || (parent.kind === 'delegated' && !user.agent))
    ) {
        const originalAgent = parentPayload ? agentOf(parentPayload) : undefined;
        return tokenForSession(
            originalAgent ? { ...user, agent: originalAgent } : user,
            parent,
            Math.min(capped, Math.max(1, Math.floor((parent.expiresAt - Date.now()) / 1000)))
        );
    }
    const session = createAuthSession(user, capped * 1000, {
        parent,
        kind: user.agent ? 'agent' : 'delegated'
    });
    return tokenForSession(
        user,
        session,
        Math.min(capped, Math.max(1, Math.floor((session.expiresAt - Date.now()) / 1000)))
    );
}

/** Refresh within the original session deadline; agents cannot extend delegated tokens. */
export function refreshJWT(user: User, payload: JwtPayload): string {
    const session = requireAuthSession(payload.sid, user.id, user.authVersion ?? 0);
    if (session.kind !== 'person' || user.agent) throw new Error('Agent sessions cannot refresh');
    const remaining = Math.floor((session.expiresAt - Date.now()) / 1000);
    if (remaining < 1) throw new Error('Session expired');
    return tokenForSession(user, session);
}

/** The agent a token was given to, if any (`{ name, reviewOnly }` claim). */
export function agentOf(payload: JwtPayload | Record<string, unknown>): AgentActor | undefined {
    const claim = (payload as { agent?: unknown }).agent;
    if (!claim || typeof claim !== 'object') return undefined;
    const { name, reviewOnly } = claim as { name?: unknown; reviewOnly?: unknown };
    if (typeof name !== 'string' || !name.trim()) return undefined;
    return { name: name.trim().slice(0, 40), reviewOnly: reviewOnly !== false };
}

/**
 * The person a request acts as: the stored account, plus the agent from the token when one
 * acts for them ("Louise via Claude" wherever the name is recorded).
 */
export function actingUser(user: User, payload: JwtPayload | Record<string, unknown>): User {
    const agent = agentOf(payload);
    if (!agent) return user;
    return { ...user, name: `${user.name ?? user.email} via ${agent.name}`, agent };
}

export function verifyJWT(token: string): JwtPayload {
    const secret = getJwtSecret();
    if (typeof token !== 'string' || !token.trim()) {
        throw new Error('Invalid or expired token [ jwt must be a string ]');
    }

    try {
        const decoded: JwtPayload = jwt.verify(token, secret as Secret, {
            algorithms: ['HS256']
        }) as JwtPayload;
        const account = getUserById(decoded.sub as string);
        if (!account?.isActive) throw new Error('Account unavailable');
        requireAuthSession(decoded.sid, account.id, account.authVersion ?? 0);
        return decoded;
    } catch (err) {
        throw new Error(
            `Invalid or expired token [ ${err instanceof Error ? err.message : 'Unknown error'} ]`,
            { cause: err }
        );
    }
}

export function requireRole(user: User, requiredRole: string): User {
    if (!user.isActive) {
        throw new Error('User is not active');
    }
    if (!hasRole(user, requiredRole)) {
        throw new Error(`Access denied: ${requiredRole} role required.`);
    }
    return user;
}
