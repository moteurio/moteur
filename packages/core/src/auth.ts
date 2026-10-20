import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import jwt, { JwtPayload, Secret, SignOptions } from 'jsonwebtoken';

import { createUser, getUserByEmail, reloadUsers, recordUserLogin } from './users.js';
import { getProjectIdsForUser } from './projects.js';
import { hasRole } from '@moteurio/types';
import { User } from '@moteurio/types/User.js';

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

    const loginAt = recordUserLogin(user.id);
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
    email: string;
    name?: string;
};

/**
 * Sign in through an OAuth provider: the account with that verified address, or a new one.
 * `onNewUser` runs once for a new account (onboarding); a disabled account is refused.
 */
export async function loginWithProvider(
    identity: ProviderIdentity,
    onNewUser?: (user: User) => Promise<void>
): Promise<{ token: string; user: User; isNew: boolean }> {
    const email = identity.email.trim();
    if (!email) throw new Error('The provider gave no email address');

    reloadUsers();
    let user = getUserByEmail(email) ?? getUserByEmail(email.toLowerCase());
    const isNew = !user;
    if (!user) {
        user = createUser({
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

    const loginAt = recordUserLogin(user.id);
    const displayUser: User = {
        ...user,
        ...(loginAt ? { lastLoginAt: loginAt } : {}),
        projects: getProjectIdsForUser(user.id)
    };
    return { token: generateJWT(displayUser), user: displayUser, isNew };
}

export function generateJWT(user: User): string {
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
        ...(user.avatar ? { avatarUrl: user.avatar } : {})
    };
    const token: string = jwt.sign(
        payload,
        secret as Secret,
        { expiresIn: JWT_EXPIRES_IN } as SignOptions
    );
    return token;
}

/** Generate a short-lived session token (e.g. for web Atelier). TTL in seconds; max 8 hours. */
export function generateSessionToken(user: User, ttlSeconds: number): string {
    const secret = getJwtSecret();
    const capped = Math.min(Math.max(ttlSeconds, 60), 8 * 60 * 60); // 1 min to 8h
    const projects = getProjectIdsForUser(user.id);
    const payload: JwtPayload = {
        sub: user.id,
        id: user.id,
        email: user.email,
        name: user.name ?? user.email,
        roles: user.roles,
        projects,
        isActive: user.isActive,
        ...(user.avatar ? { avatarUrl: user.avatar } : {})
    };
    return jwt.sign(payload, secret as Secret, { expiresIn: capped } as SignOptions);
}

export function verifyJWT(token: string): JwtPayload {
    const secret = getJwtSecret();
    if (typeof token !== 'string' || !token.trim()) {
        throw new Error('Invalid or expired token [ jwt must be a string ]');
    }

    try {
        const decoded: JwtPayload = jwt.verify(token, secret as Secret) as JwtPayload;
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
