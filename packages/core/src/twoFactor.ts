import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import jwt, { type JwtPayload, type Secret } from 'jsonwebtoken';
import type { User } from '@moteurio/types/User.js';
import { encryptSecret, decryptSecret } from './webhooks/secretEncryption.js';
import { base32Encode, newTotpSecret, otpauthUri, verifyTotp } from './totp.js';
import {
    getUserById,
    recordUserLogin,
    reloadUsers,
    updateStoredUser,
    withoutSecrets
} from './users.js';
import { getProjectIdsForUser } from './projects.js';
import { generateJWT } from './auth.js';

/**
 * Two-step sign-in for people (operators have their own, in operators.ts): an authenticator app's
 * code after the password or the provider. The secret is sealed with MOTEUR_ENCRYPTION_KEY; ten
 * one-time recovery codes are kept as digests. Signing in hands back a five-minute ticket instead
 * of a session; the ticket and a code make the session.
 */

const TICKET_AUDIENCE = 'moteur-two-factor';
const TICKET_SECONDS = 5 * 60;
const RECOVERY_CODES = 10;

function refuse(message: string, statusCode = 400, code?: string): Error {
    return Object.assign(new Error(message), { statusCode, ...(code && { code }) });
}

function jwtSecret(): Secret {
    const secret = process.env.JWT_SECRET?.trim();
    if (!secret) throw new Error('JWT_SECRET must be set in environment.');
    return secret;
}

/** A secret that opens accounts is never kept in clear on a real server. */
function assertCanSeal(): void {
    if (process.env.NODE_ENV === 'production' && !process.env.MOTEUR_ENCRYPTION_KEY?.trim())
        throw refuse(
            'This server has no encryption key, so it can’t keep two-step secrets. Its operator needs to set MOTEUR_ENCRYPTION_KEY.',
            409
        );
}

const digest = (code: string) =>
    createHash('sha256').update(code.replace(/[\s-]/g, '').toUpperCase()).digest('hex');

/** Ten codes like `K7QX-M2PD`, each good once, for when the phone is lost. */
function newRecoveryCodes(): { shown: string[]; stored: string[] } {
    const shown = Array.from({ length: RECOVERY_CODES }, () => {
        const raw = base32Encode(randomBytes(5)).slice(0, 8);
        return `${raw.slice(0, 4)}-${raw.slice(4)}`;
    });
    return { shown, stored: shown.map(digest) };
}

function person(userId: string): User {
    reloadUsers();
    const user = getUserById(userId);
    if (!user) throw refuse('User not found', 404);
    return user;
}

export function hasTwoFactor(user: Pick<User, 'twoFactor'>): boolean {
    return Boolean(user.twoFactor?.secret);
}

/** Start setting it up: a new secret to scan, kept aside until a first code confirms it. */
export async function beginTwoFactor(userId: string): Promise<{ secret: string; otpauth: string }> {
    assertCanSeal();
    const user = person(userId);
    if (hasTwoFactor(user)) throw refuse('Two-step sign-in is already on.', 409);
    const secret = newTotpSecret();
    await updateStoredUser(userId, u => ({
        ...u,
        twoFactorPending: { secret: encryptSecret(secret), createdAt: new Date().toISOString() }
    }));
    return { secret, otpauth: otpauthUri(user.email, secret) };
}

/** Turn it on with a first code from the app. Returns the recovery codes, shown once. */
export async function enableTwoFactor(
    userId: string,
    code: string
): Promise<{ recoveryCodes: string[] }> {
    const user = person(userId);
    const pending = user.twoFactorPending;
    if (!pending) throw refuse('Start setting up two-step sign-in first.', 409);
    if (Date.now() - Date.parse(pending.createdAt) > 30 * 60 * 1000)
        throw refuse('This setup expired. Start again.', 409);
    const step = verifyTotp(decryptSecret(pending.secret), code ?? '');
    if (step === null) throw refuse('That code isn’t right. Try the one the app shows now.', 400);
    const codes = newRecoveryCodes();
    await updateStoredUser(userId, u => {
        const { twoFactorPending: _pending, ...rest } = u;
        return {
            ...rest,
            twoFactor: {
                secret: pending.secret,
                lastStep: step,
                enabledAt: new Date().toISOString(),
                recoveryCodes: codes.stored
            }
        };
    });
    return { recoveryCodes: codes.shown };
}

/**
 * Check a code from the app, or a recovery code (used up). A code works once: an older or the
 * same step is refused. Returns how it was proved, or null.
 */
async function proveSecondFactor(userId: string, code: string): Promise<'app' | 'recovery' | null> {
    let proved: 'app' | 'recovery' | null = null;
    await updateStoredUser(userId, u => {
        const tf = u.twoFactor;
        if (!tf) return null;
        const step = verifyTotp(decryptSecret(tf.secret), code ?? '', { after: tf.lastStep });
        if (step !== null) {
            proved = 'app';
            return { ...u, twoFactor: { ...tf, lastStep: step } };
        }
        const given = digest(code ?? '');
        const match = tf.recoveryCodes.find(stored =>
            timingSafeEqual(Buffer.from(stored), Buffer.from(given))
        );
        if (!match || !/^[A-Z2-7]{8}$/.test((code ?? '').replace(/[\s-]/g, '').toUpperCase()))
            return null;
        proved = 'recovery';
        return {
            ...u,
            twoFactor: { ...tf, recoveryCodes: tf.recoveryCodes.filter(c => c !== match) }
        };
    });
    return proved;
}

/** Turn it off, with a code (or a recovery code): a stolen session alone can't. */
export async function disableTwoFactor(userId: string, code: string): Promise<void> {
    if (!hasTwoFactor(person(userId))) return;
    if (!(await proveSecondFactor(userId, code)))
        throw refuse('That code isn’t right.', 400, 'TWO_FACTOR_INVALID');
    await updateStoredUser(userId, u => {
        const { twoFactor: _tf, twoFactorPending: _pending, ...rest } = u;
        return rest as User;
    });
}

/** New recovery codes (the old ones stop working), with a code. */
export async function renewRecoveryCodes(
    userId: string,
    code: string
): Promise<{ recoveryCodes: string[] }> {
    if (!hasTwoFactor(person(userId))) throw refuse('Two-step sign-in is off.', 409);
    if (!(await proveSecondFactor(userId, code)))
        throw refuse('That code isn’t right.', 400, 'TWO_FACTOR_INVALID');
    const codes = newRecoveryCodes();
    await updateStoredUser(userId, u =>
        u.twoFactor ? { ...u, twoFactor: { ...u.twoFactor, recoveryCodes: codes.stored } } : null
    );
    return { recoveryCodes: codes.shown };
}

/** How many recovery codes are left, for the account page. */
export function recoveryCodesLeft(userId: string): number {
    return person(userId).twoFactor?.recoveryCodes.length ?? 0;
}

/** After a password or a provider: a ticket that, with a code, becomes a session. */
export function twoFactorTicket(user: Pick<User, 'id'>): string {
    return jwt.sign({ sub: user.id, purpose: 'two_factor' }, jwtSecret(), {
        audience: TICKET_AUDIENCE,
        expiresIn: TICKET_SECONDS
    });
}

/** The ticket's person, or a refusal: expired, forged, or not a two-step ticket. */
export function ticketUser(ticket: string): string {
    try {
        const claims = jwt.verify(ticket, jwtSecret(), {
            audience: TICKET_AUDIENCE,
            algorithms: ['HS256']
        }) as JwtPayload;
        if (claims.purpose !== 'two_factor' || typeof claims.sub !== 'string') throw new Error();
        return claims.sub;
    } catch {
        throw refuse('This sign-in expired. Sign in again.', 401, 'TWO_FACTOR_EXPIRED');
    }
}

/** The second step: the ticket and a code become a session. */
export async function completeTwoFactor(
    ticket: string,
    code: string
): Promise<{
    token: string;
    user: ReturnType<typeof withoutSecrets<User>>;
    usedRecovery: boolean;
}> {
    const userId = ticketUser(ticket);
    const user = person(userId);
    if (!user.isActive) throw refuse('User is not active', 403);
    const proved = await proveSecondFactor(userId, code);
    if (!proved) throw refuse('That code isn’t right.', 401, 'TWO_FACTOR_INVALID');
    const loginAt = await recordUserLogin(userId);
    const displayUser: User = {
        ...person(userId),
        ...(loginAt ? { lastLoginAt: loginAt } : {}),
        projects: getProjectIdsForUser(userId)
    };
    return {
        token: generateJWT(displayUser),
        user: withoutSecrets(displayUser),
        usedRecovery: proved === 'recovery'
    };
}

/** An operator's way back in for someone who lost both phone and codes. */
export async function resetTwoFactor(userId: string): Promise<void> {
    await updateStoredUser(userId, u => {
        const { twoFactor: _tf, twoFactorPending: _pending, ...rest } = u;
        return { ...(rest as User), authVersion: (u.authVersion ?? 0) + 1 };
    });
}
