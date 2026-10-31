import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import type { User, UserPreferences } from '@moteurio/types/User.js';
import { getUserById, updateStoredUser } from '../users.js';

/**
 * Turning off a kind of notification email from the email itself: a signed link, and the
 * one-click header mail apps show as "Unsubscribe" (RFC 8058). Sign-in mail has none.
 */

export const EMAIL_TOPICS = ['reviews'] as const;
export type EmailTopic = (typeof EMAIL_TOPICS)[number];

function key(): Buffer | null {
    const base = process.env.JWT_SECRET?.trim() || process.env.MOTEUR_ENCRYPTION_KEY?.trim();
    if (!base) return null;
    return Buffer.from(hkdfSync('sha256', base, 'moteur', 'moteur-email-unsubscribe', 32));
}

function sign(userId: string, topic: EmailTopic): string | null {
    const k = key();
    return k
        ? createHmac('sha256', k).update(`${userId}\n${topic}`).digest('base64url').slice(0, 32)
        : null;
}

/** The API's own public address (MOTEUR_API_URL, with API_BASE_PATH), when the server knows it. */
export function apiUrl(): string | undefined {
    const url = process.env.MOTEUR_API_URL?.trim().replace(/\/+$/, '');
    return url && /^https?:\/\//.test(url) ? url : undefined;
}

/** The link that turns this topic off for this person, or undefined when it can't be made. */
export function unsubscribeUrl(userId: string, topic: EmailTopic): string | undefined {
    const base = apiUrl();
    const s = sign(userId, topic);
    if (!base || !s) return undefined;
    return `${base}/auth/email/unsubscribe?${new URLSearchParams({ u: userId, t: topic, s })}`;
}

export function checkUnsubscribe(userId: string, topic: string, signature: string): boolean {
    if (!EMAIL_TOPICS.includes(topic as EmailTopic)) return false;
    const expected = sign(userId, topic as EmailTopic);
    if (!expected) return false;
    const [a, b] = [Buffer.from(expected), Buffer.from(String(signature))];
    return a.length === b.length && timingSafeEqual(a, b);
}

/** Whether this person still gets this topic's emails (on unless they turned it off). */
export function wantsEmail(user: User, topic: EmailTopic): boolean {
    return user.preferences?.emails?.[topic] !== false;
}

export async function setEmailTopic(userId: string, topic: EmailTopic, on: boolean) {
    if (!getUserById(userId)) throw Object.assign(new Error('No such account'), { status: 404 });
    return updateStoredUser(userId, u => ({
        ...u,
        preferences: { ...u.preferences, emails: { ...u.preferences?.emails, [topic]: on } }
    }));
}

/** Changes what someone chose: look, language, and which notification emails they get. */
export async function updatePreferences(userId: string, patch: Record<string, unknown>) {
    const next: UserPreferences = {};
    const problem = (m: string) => Object.assign(new Error(m), { status: 400 });
    if ('look' in patch) {
        if (patch.look !== null && patch.look !== 'discotheque' && patch.look !== 'folio')
            throw problem('look must be discotheque, folio or null');
        next.look = (patch.look ?? undefined) as UserPreferences['look'];
    }
    if ('locale' in patch) {
        if (
            patch.locale !== null &&
            (typeof patch.locale !== 'string' || !/^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(patch.locale))
        )
            throw problem('locale must be a language code like fr or fr-CA, or null');
        next.locale = (patch.locale ?? undefined) as string | undefined;
    }
    if ('emails' in patch) {
        const e = patch.emails as Record<string, unknown> | null;
        if (!e || typeof e !== 'object' || Array.isArray(e))
            throw problem('emails must be an object like { "reviews": false }');
        for (const [k, v] of Object.entries(e)) {
            if (!EMAIL_TOPICS.includes(k as EmailTopic)) throw problem(`Unknown email topic: ${k}`);
            if (typeof v !== 'boolean') throw problem(`emails.${k} must be true or false`);
        }
        next.emails = e as UserPreferences['emails'];
    }
    const user = await updateStoredUser(userId, u => {
        const merged: UserPreferences = { ...u.preferences };
        if ('look' in next) merged.look = next.look;
        if ('locale' in next) merged.locale = next.locale;
        if (next.emails) merged.emails = { ...merged.emails, ...next.emails };
        for (const k of Object.keys(merged) as (keyof UserPreferences)[])
            if (merged[k] === undefined) delete merged[k];
        return { ...u, preferences: merged };
    });
    return user.preferences ?? {};
}
