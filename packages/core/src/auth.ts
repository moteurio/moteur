import bcrypt from 'bcrypt';
import jwt, { JwtPayload, Secret, SignOptions } from 'jsonwebtoken';

import { getUserByEmail, reloadUsers, recordUserLogin } from './users.js';
import { getProjectIdsForUser } from './projects.js';
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
            `Invalid or expired token [ ${err instanceof Error ? err.message : 'Unknown error'} ]`
        );
    }
}

export function requireRole(user: User, requiredRole: string): User {
    if (!user.isActive) {
        throw new Error('User is not active');
    }
    if (!user.roles?.includes(requiredRole)) {
        throw new Error(`Access denied: ${requiredRole} role required.`);
    }
    return user;
}
