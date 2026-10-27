import { createHash, randomBytes, randomInt } from 'node:crypto';
import type { User } from '@moteurio/types/User.js';
import { loginWithProvider, type ProviderIdentity } from './auth.js';
import { getUserById, listUsers, reloadUsers, linkUserProvider } from './users.js';
import { privateStatePath, readPrivateState, writePrivateState } from './utils/privateStore.js';
import { sendVerificationEmail } from './emailNotifier.js';

type Pending = {
    id: string;
    browserHash: string;
    identity: ProviderIdentity;
    expiresAt: number;
    link: boolean;
    attempts: number;
    sends: number;
    sentAt?: number;
    email?: string;
    codeHash?: string;
    used?: boolean;
};
export type ProviderSignInResult =
    | { token: string }
    | { pending: { ticket: string; browserToken: string } }
    /** Two-step sign-in is on: the app asks for a code, then trades it and the ticket for a session. */
    | { twoFactor: { ticket: string } };
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const file = () => privateStatePath('provider-signins.json');
function load(): Pending[] {
    const all = readPrivateState<Pending[]>(file(), []);
    if (!Array.isArray(all)) throw new Error('Invalid provider sign-in store');
    return all.filter(p => p.expiresAt > Date.now());
}
function problem(message: string, status = 400): Error {
    return Object.assign(new Error(message), { status });
}
function pending(ticket: string, browserToken: string): { all: Pending[]; item: Pending } {
    if (!ticket || !browserToken) throw problem('This sign-in expired. Start again.');
    const all = load();
    const item = all.find(
        p => p.id === digest(ticket) && p.browserHash === digest(browserToken) && !p.used
    );
    if (!item) throw problem('This sign-in expired. Start again.');
    return { all, item };
}

/** Called only with an identity authenticated by a provider callback, never client JSON. */
export async function startProviderSignIn(
    identity: ProviderIdentity,
    onNewUser?: (user: User) => Promise<void>,
    options?: { link?: boolean }
): Promise<ProviderSignInResult> {
    const ids = Object.entries(identity.auth);
    if (
        !ids.length ||
        ids.some(
            ([, value]) =>
                !['string', 'number'].includes(typeof value) ||
                !String(value).trim() ||
                (typeof value === 'number' && !Number.isFinite(value))
        )
    )
        throw problem('Provider subject is missing');
    reloadUsers();
    const linked = listUsers().find(user =>
        ids.every(([key, value]) => user.auth?.[key] === value)
    );
    const collision = listUsers().some(
        user => user.email.toLowerCase() === identity.email.toLowerCase()
    );
    if (!options?.link && (linked || (identity.email && !collision))) {
        return loginWithProvider(identity, onNewUser);
    }
    const ticket = randomBytes(32).toString('base64url');
    const browserToken = randomBytes(32).toString('base64url');
    const all = load();
    if (all.length >= 2000) throw problem('Too many sign-ins in progress. Try again shortly.', 429);
    all.push({
        id: digest(ticket),
        browserHash: digest(browserToken),
        identity,
        expiresAt: Date.now() + 10 * 60 * 1000,
        link: options?.link === true,
        attempts: 0,
        sends: 0
    });
    writePrivateState(file(), all);
    return { pending: { ticket, browserToken } };
}

export function describeProviderSignIn(ticket: string, browserToken: string) {
    const { item } = pending(ticket, browserToken);
    const provider = Object.keys(item.identity.auth)[0];
    return {
        provider,
        emailVerified: Boolean(item.identity.email),
        linkOnly: item.link || !!item.identity.email,
        email: item.email ?? (item.identity.email || item.identity.suggestedEmail || ''),
        name: item.identity.name ?? '',
        expiresAt: new Date(item.expiresAt).toISOString()
    };
}

export async function requestProviderEmail(
    ticket: string,
    browserToken: string,
    rawEmail: string
): Promise<void> {
    const { all, item } = pending(ticket, browserToken);
    if (item.link) throw problem('Sign in to your existing account to connect this provider.');
    const email = rawEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
        throw problem('Enter a valid email address');
    if (item.sends >= 5 || (item.sentAt && Date.now() - item.sentAt < 60_000))
        throw problem('Wait before requesting another code.', 429);
    if (
        all.some(
            other =>
                other !== item &&
                other.email === email &&
                other.sentAt &&
                Date.now() - other.sentAt < 60_000
        )
    ) {
        throw problem('Wait before requesting another code.', 429);
    }
    if (
        all
            .filter(other => other.email === email)
            .reduce((count, other) => count + other.sends, 0) >= 5
    ) {
        throw problem('Too many codes requested for this email. Start again later.', 429);
    }
    const code = String(randomInt(100000, 1000000));
    item.email = email;
    item.codeHash = digest(`${ticket}:${code}`);
    item.sentAt = Date.now();
    item.sends++;
    // Persist the budget before SMTP; failures must not permit an unlimited mail flood.
    writePrivateState(file(), all);
    await sendVerificationEmail(email, code);
}

export async function completeProviderEmail(
    ticket: string,
    browserToken: string,
    code: string,
    onNewUser?: (user: User) => Promise<void>
) {
    const { all, item } = pending(ticket, browserToken);
    if (item.link || !item.email || !item.codeHash || item.attempts >= 5)
        throw problem('Request a new sign-in and email code.');
    item.attempts++;
    const valid = item.codeHash === digest(`${ticket}:${code}`);
    writePrivateState(file(), all);
    if (!valid) throw problem('The verification code is incorrect.');
    reloadUsers();
    if (listUsers().some(user => user.email.toLowerCase() === item.email)) {
        // Email proof alone never attaches a new provider to an existing account.
        throw problem('Sign in to your existing account, then connect this provider.', 409);
    }
    item.used = true;
    writePrivateState(file(), all);
    return loginWithProvider({ ...item.identity, email: item.email }, onNewUser);
}

export async function connectProvider(ticket: string, browserToken: string, userId: string) {
    const { all, item } = pending(ticket, browserToken);
    const account = getUserById(userId);
    if (!account?.isActive) throw problem('Account is unavailable', 401);
    // Consume before the first await: concurrent confirmation cannot link twice.
    item.used = true;
    writePrivateState(file(), all);
    return linkUserProvider(userId, item.identity.auth);
}
