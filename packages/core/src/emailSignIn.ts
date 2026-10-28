import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import type { SignupRecord, User } from '@moteurio/types/User.js';
import { finishSignIn, type SignedInUser, type TwoFactorStep } from './auth.js';
import { createUser, getUserByEmail, reloadUsers } from './users.js';
import { privateStatePath, readPrivateState, writePrivateState } from './utils/privateStore.js';
import { emailUnavailable, sendCodeEmail } from './emailNotifier.js';
import { signupOpen } from './signupPolicy.js';
import { hasLiveInvite } from './invites.js';
import { studioUrl } from './utils/studioUrl.js';

export { signupOpen } from './signupPolicy.js';

/**
 * Signing in, or up, with an email and a six-digit code: no password to invent or forget. One
 * door for both: a known address gets a code to sign in, a new one a code to make an account
 * (when this server takes new accounts, or the address was invited). Nobody learns who has an
 * account by trying addresses: the answer, and how long it takes, are the same either way.
 *
 * With `STUDIO_URL` set, each email also carries a sign-in link: a long token nobody can guess. Too
 * many wrong codes stop typed codes for that address for a day, but the link still works, so
 * someone typing wrong codes for another person's address can't keep them out.
 */

const CODE_MINUTES = 15;
const RESEND_SECONDS = 60;
/** Codes asked for one address in an hour. */
const SENDS_PER_HOUR = 10;
/** Tries on one code. */
const ATTEMPTS = 5;
/** Wrong codes for one address in a day, across codes: then no more codes that day. */
const WRONG_PER_DAY = 10;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

type Purpose = 'signin' | 'signup';
type Pending = {
    id: string;
    purpose: Purpose;
    salt: string;
    codeHash: string;
    expiresAt: number;
    sentAt: number;
    /** When codes went to this address, the last hour's. */
    sends: number[];
    /** When wrong codes came in for this address, the last day's. */
    wrong: number[];
    attempts: number;
    /**
     * Sign-in links sent and not yet expired, their tokens hashed. A new request keeps the earlier
     * ones, so asking again for someone's address can't void the link they're about to open.
     */
    links?: { hash: string; expiresAt: number }[];
    context?: SignupContext;
};
type Store = { pending: Pending[]; sent: number[] };

/** Where a new account came from, as the sign-up page knows it. */
export type SignupContext = Pick<SignupRecord, 'from' | 'goal' | 'campaign' | 'locale'>;

const file = () => privateStatePath('email-codes.json');
const normalise = (email: string) => email.trim().toLowerCase();

/** A keyed hash: a stolen store tells nothing without the server's secret. */
function keyed(...parts: string[]): string {
    const key = process.env.JWT_SECRET || process.env.MOTEUR_ENCRYPTION_KEY || 'moteur-email-codes';
    return createHmac('sha256', key).update(parts.join(':')).digest('hex');
}
const addressId = (email: string) => keyed('address', email);

function problem(message: string, status = 400, code?: string): Error {
    return Object.assign(new Error(message), { status, ...(code && { code }) });
}

function load(now = Date.now()): Store {
    const raw = readPrivateState<Store | Pending[]>(file(), { pending: [], sent: [] });
    const store: Store = Array.isArray(raw) ? { pending: [], sent: [] } : raw;
    return {
        sent: (store.sent ?? []).filter(t => t > now - HOUR),
        pending: (store.pending ?? [])
            .map(p => ({
                ...p,
                sends: (p.sends ?? []).filter(t => t > now - HOUR),
                wrong: (p.wrong ?? []).filter(t => t > now - DAY),
                links: (p.links ?? []).filter(l => l.expiresAt > now)
            }))
            .filter(p => p.expiresAt > now || p.sends.length || p.wrong.length || p.links.length)
    };
}

/** Code emails this server sends in an hour, all addresses together (`MOTEUR_EMAIL_CODES_PER_HOUR`). */
function hourlyCap(): number {
    const n = Number(process.env.MOTEUR_EMAIL_CODES_PER_HOUR);
    return Number.isFinite(n) && n > 0 ? n : 300;
}

/** Codes printed to the server's log instead of mailed: a developer's machine only, said explicitly. */
function codesToLog(): boolean {
    return process.env.MOTEUR_EMAIL_CODES_TO_LOG === '1';
}

/**
 * Whether people can sign in and up with email codes here: on unless the operator turns it off
 * (`MOTEUR_EMAIL_SIGNIN=off`), and only when codes can reach them.
 */
export function emailCodesAvailable(): boolean {
    if (process.env.MOTEUR_EMAIL_SIGNIN?.trim().toLowerCase() === 'off') return false;
    return !emailUnavailable() || codesToLog();
}

const WORDS = {
    en: {
        subject: (code: string) => `${code} is your Moteur code`,
        linkSubject: 'Your Moteur sign-in link',
        signin: 'Here is your code to sign in to Moteur',
        signup: 'Here is your code to finish making your Moteur account',
        orLink: 'Or open this link',
        linkOnly:
            'Too many wrong codes were typed for this address today, so codes are off until tomorrow. Open this link to go on',
        after: `It works once, for ${CODE_MINUTES} minutes. If you didn't ask for it, ignore this email: nothing happens without it.`
    },
    fr: {
        subject: (code: string) => `${code} est votre code Moteur`,
        linkSubject: 'Votre lien de connexion Moteur',
        signin: 'Voici votre code pour vous connecter à Moteur',
        signup: 'Voici votre code pour terminer la création de votre compte Moteur',
        orLink: 'Ou ouvrez ce lien',
        linkOnly:
            'Trop de codes erronés ont été saisis pour cette adresse aujourd’hui, les codes sont donc désactivés jusqu’à demain. Ouvrez ce lien pour continuer',
        after: `Il ne sert qu’une fois, pendant ${CODE_MINUTES} minutes. Si vous ne l’avez pas demandé, ignorez ce courriel\u202f: rien ne se passe sans lui.`
    }
};

/** Where the link opens: the Studio's page, with what it needs after `#`, so it reaches no server log. */
function signInLink(email: string, token: string): string | undefined {
    const studio = studioUrl();
    if (!studio) return undefined;
    return `${studio}/auth/email#${new URLSearchParams({ email, token }).toString()}`;
}

/** Sends after the answer has gone: delivery time never tells whether the address has an account. */
function deliverLater(
    email: string,
    code: string | null,
    purpose: Purpose,
    locale?: string,
    link?: string
) {
    const w = locale?.toLowerCase().startsWith('fr') ? WORDS.fr : WORDS.en;
    const text = code
        ? `${w[purpose]}:\n\n    ${code.slice(0, 3)} ${code.slice(3)}\n\n${link ? `${w.orLink}:\n\n${link}\n\n` : ''}${w.after}`
        : `${w.linkOnly}:\n\n${link}\n\n${w.after}`;
    setTimeout(() => {
        if (codesToLog()) {
            console.info(
                `[moteur] Email code for ${email} (${purpose}): ${code ?? 'none'}${link ? ` ${link}` : ''}`
            );
            return;
        }
        sendCodeEmail({
            to: [email],
            subject: code ? w.subject(code) : w.linkSubject,
            text
        }).catch(err => {
            console.error(
                '[moteur] An email code could not be sent:',
                err instanceof Error ? err.message : err
            );
        });
    });
}

/**
 * Send a code to this address: to sign in if it has an account, to sign up if it doesn't and the
 * server takes new accounts (or it was invited). Says nothing about which, and sends nothing to an
 * address that can't use one. Throws only for a bad address, a server without email codes, or too
 * many requests: the same for every address.
 */
export async function requestEmailCode(
    rawEmail: string,
    context: SignupContext = {}
): Promise<void> {
    const email = normalise(rawEmail);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
        throw problem('Enter a valid email address.', 400, 'EMAIL_INVALID');
    if (!emailCodesAvailable())
        throw problem('Email sign-in is not set up on this server.', 503, 'EMAIL_UNAVAILABLE');

    const now = Date.now();
    const store = load(now);
    const id = addressId(email);
    const previous = store.pending.find(p => p.id === id);
    const sends = previous?.sends ?? [];
    const wrong = previous?.wrong ?? [];
    if (previous && now - previous.sentAt < RESEND_SECONDS * 1000)
        throw problem('Wait a minute before asking for another code.', 429, 'EMAIL_CODE_WAIT');
    if (sends.length >= SENDS_PER_HOUR)
        throw problem(
            'Too many codes for this address. Try again in an hour.',
            429,
            'EMAIL_CODE_LIMIT'
        );
    // Codes are off for the day; the link still goes when there can be one.
    const codesOff = wrong.length >= WRONG_PER_DAY;
    if (codesOff && !studioUrl())
        throw problem(
            'Too many wrong codes for this address. Try again tomorrow.',
            429,
            'EMAIL_CODE_LOCKED'
        );
    if (store.sent.length >= hourlyCap())
        throw problem(
            'Too many codes are going out right now. Try again shortly.',
            429,
            'EMAIL_CODE_BUSY'
        );

    reloadUsers();
    const user = getUserByEmail(email);
    const purpose: Purpose | null = user
        ? user.isActive
            ? 'signin'
            : null
        : signupOpen() || hasLiveInvite(email)
          ? 'signup'
          : null;

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const salt = randomBytes(16).toString('hex');
    const token = randomBytes(32).toString('base64url');
    const link = purpose ? signInLink(email, token) : undefined;
    const next: Pending = {
        id,
        purpose: purpose ?? 'signin',
        salt,
        // No purpose: a code nobody can use, kept only so limits and timing look alike.
        codeHash: purpose && !codesOff ? keyed(salt, email, code) : '',
        links: [
            ...(previous?.links ?? []),
            ...(link
                ? [{ hash: keyed('link', email, token), expiresAt: now + CODE_MINUTES * 60_000 }]
                : [])
        ],
        expiresAt: purpose ? now + CODE_MINUTES * 60_000 : now,
        sentAt: now,
        sends: [...sends, now],
        wrong,
        attempts: 0,
        ...(purpose === 'signup' && { context: cleanContext(context) })
    };
    // Kept before sending: a failing mail server must not allow unlimited tries.
    writePrivateState(file(), {
        pending: [...store.pending.filter(p => p.id !== id), next],
        sent: purpose ? [...store.sent, now] : store.sent
    } satisfies Store);
    if (purpose) deliverLater(email, codesOff ? null : code, purpose, context.locale, link);
}

function cleanContext(context: SignupContext): SignupContext {
    const text = (v: unknown, max = 200) =>
        typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;
    const campaign = Object.fromEntries(
        Object.entries(context.campaign ?? {})
            .filter(([k, v]) => /^(source|medium|campaign|term|content)$/.test(k) && text(v))
            .map(([k, v]) => [k, text(v)!])
    );
    const from = text(context.from);
    return {
        ...(from?.startsWith('/') && { from }),
        ...(text(context.goal, 40) && { goal: text(context.goal, 40) }),
        ...(Object.keys(campaign).length && { campaign }),
        ...(text(context.locale, 10) && { locale: text(context.locale, 10) })
    };
}

export type EmailCodeResult = { token: string; user: SignedInUser; isNew: boolean } | TwoFactorStep;

/**
 * Trade the code for a session: signs in, or makes the account first. `name` names a new
 * account (else the address's first part); `onNewUser` runs once for it (welcome email).
 */
export async function verifyEmailCode(
    rawEmail: string,
    rawCode: string,
    options: { name?: string; onNewUser?: (user: User) => Promise<void> } = {}
): Promise<EmailCodeResult> {
    const email = normalise(rawEmail);
    const code = rawCode.replace(/\D/g, '');
    const now = Date.now();
    const store = load(now);
    const item = store.pending.find(p => p.id === addressId(email));
    const save = () => writePrivateState(file(), store);
    if (!item || item.expiresAt <= now || !item.codeHash || item.attempts >= ATTEMPTS)
        throw problem('This code has expired. Ask for a new one.', 400, 'EMAIL_CODE_EXPIRED');
    item.attempts++;
    const given = Buffer.from(keyed(item.salt, email, code));
    const expected = Buffer.from(item.codeHash);
    if (
        code.length !== 6 ||
        given.length !== expected.length ||
        !timingSafeEqual(given, expected)
    ) {
        item.wrong.push(now);
        // Out of tries on this code, or on this address for the day: the code goes.
        if (item.attempts >= ATTEMPTS || item.wrong.length >= WRONG_PER_DAY) item.codeHash = '';
        save();
        throw problem(
            item.codeHash
                ? 'That code is not right. Check the email and try again.'
                : 'Too many wrong codes. Ask for a new one.',
            400,
            item.codeHash ? 'EMAIL_CODE_WRONG' : 'EMAIL_CODE_EXPIRED'
        );
    }
    return useCode(email, item, store, now, options);
}

/**
 * Trade a sign-in link's token for a session, as `verifyEmailCode` does for the code. The token
 * is long and random, so wrong ones count for nothing: the link works even when codes are off.
 */
export async function verifyEmailLink(
    rawEmail: string,
    rawToken: string,
    options: { name?: string; onNewUser?: (user: User) => Promise<void> } = {}
): Promise<EmailCodeResult> {
    const email = normalise(rawEmail);
    const now = Date.now();
    const store = load(now);
    const item = store.pending.find(p => p.id === addressId(email));
    const given = Buffer.from(keyed('link', email, String(rawToken)));
    const matches = (hash: string) => {
        const expected = Buffer.from(hash);
        return given.length === expected.length && timingSafeEqual(given, expected);
    };
    if (!item?.links?.some(l => l.expiresAt > now && matches(l.hash)))
        throw problem('This link has expired. Ask for a new one.', 400, 'EMAIL_LINK_EXPIRED');
    return useCode(email, item, store, now, options);
}

/** The code or link was right: it's used up, then the person signs in (or their account is made). */
async function useCode(
    email: string,
    item: Pending,
    store: Store,
    now: number,
    options: { name?: string; onNewUser?: (user: User) => Promise<void> }
): Promise<EmailCodeResult> {
    // Used: gone, whatever happens next.
    item.codeHash = '';
    item.links = [];
    item.expiresAt = now;
    writePrivateState(file(), store);

    reloadUsers();
    let user = getUserByEmail(email);
    let isNew = false;
    if (item.purpose === 'signup') {
        if (user) throw problem('This address already has an account. Sign in instead.', 409);
        if (!signupOpen() && !hasLiveInvite(email))
            throw problem('This server is not taking new accounts.', 403, 'SIGNUP_CLOSED');
        const name = options.name?.trim().slice(0, 120) || email.split('@')[0];
        user = await createUser({
            id: `user:${randomUUID()}`,
            isActive: true,
            email,
            name,
            roles: [],
            projects: [],
            signup: { at: new Date().toISOString(), method: 'email', ...item.context }
        });
        isNew = true;
        if (options.onNewUser) await options.onNewUser(user).catch(() => undefined);
    }
    if (!user || !user.isActive) throw problem('This account cannot sign in.', 403);
    const done = await finishSignIn(user);
    return 'twoFactor' in done ? done : { ...done, isNew };
}
