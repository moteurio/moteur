import { createHash, randomBytes } from 'node:crypto';
import {
    generateAuthenticationOptions,
    generateRegistrationOptions,
    verifyAuthenticationResponse,
    verifyRegistrationResponse,
    type AuthenticationResponseJSON,
    type RegistrationResponseJSON
} from '@simplewebauthn/server';
import { decodeClientDataJSON, isoBase64URL } from '@simplewebauthn/server/helpers';
import type {
    PasskeyAuthenticationJSON,
    PasskeyCreationOptionsJSON,
    PasskeyRegistrationJSON,
    PasskeyRequestOptionsJSON,
    PasskeySummary,
    StoredPasskey
} from '@moteurio/types/Passkey.js';
import type { User } from '@moteurio/types/User.js';
import { startSession, type SignedInUser } from './auth.js';
import { revokeAuthSession } from './authSessions.js';
import { connectedProviders } from './accountConnections.js';
import { emailCodesAvailable } from './emailSignIn.js';
import { ticketUser } from './twoFactor.js';
import {
    getCachedUsers,
    getUserByEmail,
    getUserById,
    reloadUsers,
    updateStoredUser
} from './users.js';
import { privateStatePath, readPrivateState, writePrivateState } from './utils/privateStore.js';
import { withWriteLock } from './utils/projectWriteLock.js';
import { triggerEvent } from './utils/eventBus.js';

/**
 * Passkeys (WebAuthn): signing in with the device's lock (face, finger, PIN) instead of a
 * password. The browser makes a key pair for this server; the public half is kept on the account,
 * and each sign-in is a signature over a fresh challenge. `@simplewebauthn/server` checks them.
 *
 * - Every passkey here is discoverable (`residentKey: required`) and must verify the person
 *   (`userVerification: required`), so a passkey is two steps in one: it signs in without the
 *   authenticator app's code, and can stand in for that code after a password or an email code.
 * - Nothing on an endpoint anyone can call lists an account's passkeys: signing in with an email
 *   binds the challenge to that address, and tells nothing about whether it has an account.
 * - A challenge works once, for five minutes, and only for what it was made for.
 * - Losing every passkey never locks anyone out: the email code still signs them in.
 */

const CHALLENGE_MS = 5 * 60 * 1000;
/** Challenges waiting at once, all accounts together: the oldest go first. */
const PENDING_MAX = 2000;
export const PASSKEYS_MAX = 20;
export const PASSKEY_NAME_MAX = 60;
const LOCAL_HOSTS = new Set(['localhost']);

function refuse(message: string, status = 400, code?: string, extra?: Record<string, unknown>) {
    return Object.assign(new Error(message), { status, ...(code && { code }), ...extra });
}

// ---------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------

export type PasskeySettings = {
    /** The relying party: the Studio's host (or a parent domain of it). */
    rpID: string;
    rpName: string;
    /** Pages allowed to ask for a passkey: the Studio's origins. */
    origins: string[];
    /** A developer's machine without `STUDIO_URL`: any `localhost` port. */
    anyLocalhostPort: boolean;
};

const list = (value: string | undefined) =>
    (value ?? '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);

const isIp = (host: string) => /^[\d.]+$/.test(host) || host.includes(':');

/** The settings, a reason they can't be used, or null when passkeys are turned off. */
export function readPasskeySettings(): { settings: PasskeySettings } | { problem: string } | null {
    const toggle = process.env.MOTEUR_PASSKEYS?.trim().toLowerCase();
    if (toggle && ['off', 'false', '0', 'no'].includes(toggle)) return null;
    const configured = list(process.env.MOTEUR_PASSKEY_ORIGINS);
    const raw = configured.length ? configured : list(process.env.STUDIO_URL);
    const origins: string[] = [];
    for (const value of raw) {
        let url: URL;
        try {
            url = new URL(value);
        } catch {
            return { problem: `${value} is not a URL` };
        }
        if (
            url.protocol !== 'https:' &&
            !(url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname))
        )
            return { problem: `${url.origin} must use https outside localhost` };
        if (isIp(url.hostname))
            return { problem: `${url.origin}: passkeys need a host name, not an IP address` };
        origins.push(url.origin);
    }
    const rpName = process.env.MOTEUR_PASSKEY_RP_NAME?.trim() || 'Moteur';
    const rpOverride = process.env.MOTEUR_PASSKEY_RP_ID?.trim().toLowerCase();
    if (!origins.length) {
        if (process.env.NODE_ENV === 'production')
            return {
                problem: 'set STUDIO_URL (or MOTEUR_PASSKEY_ORIGINS) to the Studio’s address'
            };
        const rpID = rpOverride || 'localhost';
        if (rpID !== 'localhost')
            return { problem: 'MOTEUR_PASSKEY_RP_ID needs MOTEUR_PASSKEY_ORIGINS or STUDIO_URL' };
        return { settings: { rpID, rpName, origins: [], anyLocalhostPort: true } };
    }
    const rpID = rpOverride || new URL(origins[0]).hostname;
    if (isIp(rpID) || rpID.startsWith('.') || rpID.endsWith('.'))
        return { problem: `MOTEUR_PASSKEY_RP_ID ${rpID} is not a host name` };
    for (const origin of origins) {
        const host = new URL(origin).hostname;
        if (host !== rpID && !host.endsWith(`.${rpID}`))
            return { problem: `${origin} is not on ${rpID} (MOTEUR_PASSKEY_RP_ID)` };
    }
    return { settings: { rpID, rpName, origins, anyLocalhostPort: false } };
}

const warned = new Set<string>();

/** The settings when passkeys can be offered, else null; a misconfiguration is logged once. */
export function passkeySettings(): PasskeySettings | null {
    const read = readPasskeySettings();
    if (read && 'settings' in read) return read.settings;
    if (read && !warned.has(read.problem)) {
        warned.add(read.problem);
        console.warn(`[auth] passkeys are off: ${read.problem}.`);
    }
    return null;
}

export function passkeysAvailable(): boolean {
    return passkeySettings() !== null;
}

function settingsOrRefuse(): PasskeySettings {
    const settings = passkeySettings();
    if (!settings)
        throw refuse('Passkeys aren’t set up on this server.', 404, 'PASSKEYS_UNAVAILABLE');
    return settings;
}

function originAllowed(settings: PasskeySettings, origin: string): boolean {
    if (settings.origins.includes(origin)) return true;
    if (!settings.anyLocalhostPort) return false;
    try {
        const url = new URL(origin);
        return url.origin === origin && LOCAL_HOSTS.has(url.hostname);
    } catch {
        return false;
    }
}

// ---------------------------------------------------------------------------------------------
// Challenges: each works once, for one purpose, for five minutes
// ---------------------------------------------------------------------------------------------

type Purpose = 'register' | 'signin';
type Challenge = {
    /** The challenge's digest: what it is looked up by. */
    id: string;
    purpose: Purpose;
    /** Registering: the account. Signing in: the account it must be, when one was named. */
    userId?: string;
    expiresAt: number;
};

const challengesFile = () => privateStatePath('passkey-challenges.json');
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

async function rememberChallenge(entry: Omit<Challenge, 'id' | 'expiresAt'>): Promise<string> {
    const challenge = isoBase64URL.fromBuffer(randomBytes(32));
    const file = challengesFile();
    await withWriteLock(file, async () => {
        const now = Date.now();
        const live = readPrivateState<Challenge[]>(file, []).filter(c => c.expiresAt > now);
        live.push({ ...entry, id: digest(challenge), expiresAt: now + CHALLENGE_MS });
        writePrivateState(file, live.slice(-PENDING_MAX));
    });
    return challenge;
}

/** Take the challenge out (it never works twice, even when what follows fails). */
async function takeChallenge(challenge: string, purpose: Purpose): Promise<Challenge> {
    const file = challengesFile();
    const found = await withWriteLock(file, async () => {
        const now = Date.now();
        const all = readPrivateState<Challenge[]>(file, []);
        const id = digest(challenge);
        const match = all.find(c => c.id === id);
        const rest = all.filter(c => c.id !== id && c.expiresAt > now);
        if (match || rest.length !== all.length) writePrivateState(file, rest);
        return match && match.expiresAt > now && match.purpose === purpose ? match : null;
    });
    if (!found) throw refuse('This passkey request expired. Try again.', 400, 'PASSKEY_EXPIRED');
    return found;
}

/** The challenge and page the browser signed, before anything else is believed. */
function clientData(
    response: { response?: { clientDataJSON?: unknown } },
    settings: PasskeySettings
): { challenge: string; origin: string } {
    const encoded = response?.response?.clientDataJSON;
    let data: { challenge?: unknown; origin?: unknown };
    try {
        if (typeof encoded !== 'string' || encoded.length > 10_000) throw new Error();
        data = decodeClientDataJSON(encoded);
    } catch {
        throw refuse('That passkey answer can’t be read.', 400, 'PASSKEY_INVALID');
    }
    if (typeof data.challenge !== 'string' || typeof data.origin !== 'string')
        throw refuse('That passkey answer can’t be read.', 400, 'PASSKEY_INVALID');
    if (!originAllowed(settings, data.origin))
        throw refuse('Passkeys work from the Studio’s own address only.', 400, 'PASSKEY_ORIGIN');
    return { challenge: data.challenge, origin: data.origin };
}

// ---------------------------------------------------------------------------------------------
// What a passkey is called, and what the account page shows
// ---------------------------------------------------------------------------------------------

/** Authenticators whose id says where the passkey lives (the community's AAGUID list). */
const PROVIDERS: Record<string, string> = {
    'fbfc3007-154e-4ecc-8c0b-6e020557d7bd': 'iCloud Keychain',
    'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4': 'Google Password Manager',
    'adce0002-35bc-c60a-648b-0b25f1f05503': 'Chrome on Mac',
    '08987058-cadc-4b81-b6e1-30de50dcbe96': 'Windows Hello',
    '9ddd1817-af5a-4672-a2b9-3e3dd95000a9': 'Windows Hello',
    '6028b017-b1d4-4c02-b4b3-afcdafc96bb2': 'Windows Hello',
    'bada5566-a7aa-401f-bd96-45619a55120d': '1Password',
    'd548826e-79b4-db40-a3d8-11116f7e8349': 'Bitwarden',
    '531126d6-e717-415c-9320-3d9aa6981239': 'Dashlane',
    '53414d53-554e-4700-0000-000000000000': 'Samsung Pass'
};

/** "Safari on macOS", from a user agent; undefined when it says nothing useful. */
export function deviceFromUserAgent(ua: string | undefined): string | undefined {
    if (!ua) return undefined;
    const browser = /Edg\//.test(ua)
        ? 'Edge'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Chrome\/|CriOS\//.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : undefined;
    const system = /iPhone|iPad|iPod/.test(ua)
        ? 'iOS'
        : /Android/.test(ua)
          ? 'Android'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'macOS'
            : /Windows/.test(ua)
              ? 'Windows'
              : /CrOS/.test(ua)
                ? 'ChromeOS'
                : /Linux/.test(ua)
                  ? 'Linux'
                  : undefined;
    if (browser && system) return `${browser} on ${system}`;
    return browser ?? system;
}

export function summarize(passkey: StoredPasskey): PasskeySummary {
    const provider = passkey.aaguid ? PROVIDERS[passkey.aaguid] : undefined;
    return {
        id: passkey.id,
        name: passkey.name,
        createdAt: passkey.createdAt,
        ...(passkey.lastUsedAt && { lastUsedAt: passkey.lastUsedAt }),
        synced: passkey.deviceType === 'multiDevice' && passkey.backedUp,
        deviceType: passkey.deviceType,
        ...(provider && { provider }),
        ...(passkey.createdOn && { createdOn: passkey.createdOn }),
        ...(passkey.transports?.length && { transports: passkey.transports })
    };
}

function cleanName(name: unknown): string {
    if (typeof name !== 'string') return '';
    return name.replace(/\s+/g, ' ').trim().slice(0, PASSKEY_NAME_MAX);
}

function account(userId: string): User {
    reloadUsers();
    const user = getUserById(userId);
    if (!user?.isActive) throw refuse('Account unavailable', 401);
    return user;
}

export function listPasskeys(userId: string): PasskeySummary[] {
    return (account(userId).passkeys ?? []).map(summarize);
}

// ---------------------------------------------------------------------------------------------
// Adding one (the API checks for a recent personal sign-in first)
// ---------------------------------------------------------------------------------------------

export async function beginPasskeyRegistration(
    userId: string
): Promise<PasskeyCreationOptionsJSON> {
    const settings = settingsOrRefuse();
    let user = account(userId);
    if ((user.passkeys?.length ?? 0) >= PASSKEYS_MAX)
        throw refuse(
            `An account can have ${PASSKEYS_MAX} passkeys. Remove one first.`,
            409,
            'PASSKEY_LIMIT'
        );
    if (!user.passkeyUserId)
        user = await updateStoredUser(userId, u =>
            u.passkeyUserId
                ? null
                : { ...u, passkeyUserId: isoBase64URL.fromBuffer(randomBytes(32)) }
        );
    const challenge = await rememberChallenge({ purpose: 'register', userId });
    const options = await generateRegistrationOptions({
        rpName: settings.rpName,
        rpID: settings.rpID,
        userName: user.email,
        userDisplayName: user.name?.trim() || user.email,
        userID: isoBase64URL.toBuffer(user.passkeyUserId!),
        challenge: isoBase64URL.toBuffer(challenge),
        timeout: CHALLENGE_MS,
        attestationType: 'none',
        // The browser won't make a second passkey on an authenticator that holds one already.
        excludeCredentials: (user.passkeys ?? []).map(p => ({
            id: p.id,
            transports: p.transports
        })),
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' }
    });
    return options as PasskeyCreationOptionsJSON;
}

export async function finishPasskeyRegistration(
    userId: string,
    response: PasskeyRegistrationJSON,
    options: { name?: string; userAgent?: string } = {}
): Promise<PasskeySummary> {
    const settings = settingsOrRefuse();
    const { challenge, origin } = clientData(response, settings);
    const pending = await takeChallenge(challenge, 'register');
    if (pending.userId !== userId)
        throw refuse('This passkey request expired. Try again.', 400, 'PASSKEY_EXPIRED');
    let info;
    try {
        const result = await verifyRegistrationResponse({
            response: response as unknown as RegistrationResponseJSON,
            expectedChallenge: challenge,
            expectedOrigin: origin,
            expectedRPID: settings.rpID,
            requireUserVerification: true
        });
        if (!result.verified) throw new Error('not verified');
        info = result.registrationInfo;
    } catch {
        throw refuse('That passkey didn’t check out. Try again.', 400, 'PASSKEY_INVALID');
    }
    const { credential } = info;
    reloadUsers();
    if (getCachedUsers().some(u => u.passkeys?.some(p => p.id === credential.id)))
        throw refuse('This passkey is already in use.', 409, 'PASSKEY_EXISTS');
    const createdOn = deviceFromUserAgent(options.userAgent);
    const aaguid =
        info.aaguid && !/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(info.aaguid) ? info.aaguid : undefined;
    const name = cleanName(options.name) || (aaguid && PROVIDERS[aaguid]) || createdOn || 'Passkey';
    const passkey: StoredPasskey = {
        id: credential.id,
        publicKey: isoBase64URL.fromBuffer(credential.publicKey),
        counter: credential.counter,
        ...(credential.transports?.length && { transports: credential.transports.slice(0, 8) }),
        deviceType: info.credentialDeviceType,
        backedUp: info.credentialBackedUp,
        ...(aaguid && { aaguid }),
        name,
        createdAt: new Date().toISOString(),
        ...(createdOn && { createdOn })
    };
    await updateStoredUser(userId, u => {
        if (!u.isActive) throw refuse('Account unavailable', 401);
        const current = u.passkeys ?? [];
        if (current.length >= PASSKEYS_MAX)
            throw refuse(
                `An account can have ${PASSKEYS_MAX} passkeys. Remove one first.`,
                409,
                'PASSKEY_LIMIT'
            );
        return { ...u, passkeys: [...current, passkey] };
    });
    await triggerEvent('auth.passkey.added', { userId, passkeyId: passkey.id });
    return summarize(passkey);
}

// ---------------------------------------------------------------------------------------------
// Renaming and removing
// ---------------------------------------------------------------------------------------------

export async function renamePasskey(
    userId: string,
    passkeyId: string,
    name: unknown
): Promise<PasskeySummary> {
    const clean = cleanName(name);
    if (!clean) throw refuse('A passkey needs a name.', 400);
    let renamed: StoredPasskey | undefined;
    await updateStoredUser(userId, u => {
        const passkeys = (u.passkeys ?? []).map(p =>
            p.id === passkeyId ? (renamed = { ...p, name: clean }) : p
        );
        return renamed ? { ...u, passkeys } : null;
    });
    if (!renamed) throw refuse('Passkey not found', 404);
    return summarize(renamed);
}

/**
 * Remove a passkey. Sessions end (the API hands back a replacement token): whoever signed in with
 * it is out. The last way in can't be removed; the email code counts, where the server sends one.
 */
export async function removePasskey(userId: string, passkeyId: string): Promise<User> {
    let found = false;
    const updated = await updateStoredUser(userId, u => {
        const passkeys = u.passkeys ?? [];
        if (!passkeys.some(p => p.id === passkeyId)) return null;
        found = true;
        const rest = passkeys.filter(p => p.id !== passkeyId);
        const anotherWay =
            rest.length > 0 ||
            Boolean(u.passwordHash) ||
            connectedProviders(u).length > 0 ||
            emailCodesAvailable();
        if (!anotherWay)
            throw refuse('Keep at least one way to sign in.', 409, 'LAST_SIGN_IN_METHOD');
        const { passkeys: _all, ...others } = u;
        return {
            ...(others as User),
            ...(rest.length && { passkeys: rest }),
            authVersion: (u.authVersion ?? 0) + 1
        };
    });
    if (!found) throw refuse('Passkey not found', 404);
    revokeAuthSession(userId);
    await triggerEvent('auth.passkey.removed', { userId, passkeyId });
    return updated;
}

// ---------------------------------------------------------------------------------------------
// Signing in
// ---------------------------------------------------------------------------------------------

/**
 * Options to sign in with a passkey. With nothing, any of this server's passkeys answers (the
 * browser offers them, in autofill too). With `email`, only that account's passkey will do; the
 * answer looks the same whether the address has an account or not. With a two-step `ticket` (after
 * a password or an email code), the passkey stands in for the app's code, and the browser is told
 * which ones are that person's.
 */
export async function beginPasskeySignIn(
    input: { email?: string; ticket?: string } = {}
): Promise<PasskeyRequestOptionsJSON> {
    const settings = settingsOrRefuse();
    let userId: string | undefined;
    let allow: StoredPasskey[] = [];
    if (input.ticket) {
        userId = ticketUser(input.ticket);
        allow = account(userId).passkeys ?? [];
        if (!allow.length) throw refuse('No passkey on this account.', 409, 'NO_PASSKEY');
    } else if (input.email?.trim()) {
        reloadUsers();
        // An address with no account gets a challenge no passkey can answer.
        userId =
            getUserByEmail(input.email)?.id ?? `nobody:${digest(input.email.trim().toLowerCase())}`;
    }
    const challenge = await rememberChallenge({ purpose: 'signin', ...(userId && { userId }) });
    const options = await generateAuthenticationOptions({
        rpID: settings.rpID,
        challenge: isoBase64URL.toBuffer(challenge),
        timeout: CHALLENGE_MS,
        userVerification: 'required',
        ...(allow.length && {
            allowCredentials: allow.map(p => ({ id: p.id, transports: p.transports }))
        })
    });
    return options as PasskeyRequestOptionsJSON;
}

/** The browser's signed answer: a session. A passkey needs no app code after it. */
export async function finishPasskeySignIn(
    response: PasskeyAuthenticationJSON
): Promise<{ token: string; user: SignedInUser; passkeyId: string }> {
    const settings = settingsOrRefuse();
    const { challenge, origin } = clientData(response, settings);
    const pending = await takeChallenge(challenge, 'signin');
    const credentialId = typeof response?.id === 'string' ? response.id : '';
    reloadUsers();
    const owner = credentialId
        ? getCachedUsers().find(u => u.passkeys?.some(p => p.id === credentialId))
        : undefined;
    const passkey = owner?.passkeys?.find(p => p.id === credentialId);
    if (!owner || !passkey)
        // The browser can forget it (PublicKeyCredential.signalUnknownCredential).
        throw refuse(
            'This passkey isn’t known here. It may have been removed.',
            401,
            'PASSKEY_UNKNOWN',
            {
                credentialId,
                rpId: settings.rpID
            }
        );
    if (pending.userId && pending.userId !== owner.id)
        throw refuse('That passkey is for another account.', 401, 'PASSKEY_WRONG_ACCOUNT');
    const handle = response.response?.userHandle;
    if (handle && handle !== owner.passkeyUserId)
        throw refuse('That passkey didn’t check out. Try again.', 401, 'PASSKEY_INVALID');
    let info;
    try {
        const result = await verifyAuthenticationResponse({
            response: response as unknown as AuthenticationResponseJSON,
            expectedChallenge: challenge,
            expectedOrigin: origin,
            expectedRPID: settings.rpID,
            requireUserVerification: true,
            credential: {
                id: passkey.id,
                publicKey: isoBase64URL.toBuffer(passkey.publicKey),
                counter: passkey.counter,
                transports: passkey.transports as never
            }
        });
        if (!result.verified) throw new Error('not verified');
        info = result.authenticationInfo;
    } catch {
        throw refuse('That passkey didn’t check out. Try again.', 401, 'PASSKEY_INVALID');
    }
    if (!owner.isActive) throw refuse('User is not active', 403);
    const usedAt = new Date().toISOString();
    const saved = await updateStoredUser(owner.id, u => ({
        ...u,
        passkeys: (u.passkeys ?? []).map(p =>
            p.id === passkey.id
                ? {
                      ...p,
                      counter: info.newCounter,
                      backedUp: info.credentialBackedUp,
                      lastUsedAt: usedAt
                  }
                : p
        )
    }));
    await triggerEvent('auth.passkey.used', { userId: owner.id, passkeyId: passkey.id });
    return { ...(await startSession(saved)), passkeyId: passkey.id };
}
