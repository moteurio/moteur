import type { User } from '@moteurio/types/User.js';
import { canTranslate, canWrite, hasRole, translatorOnly } from '@moteurio/types';

/** A refusal the API turns into HTTP 403. */
export function contentForbidden(message: string): Error {
    const err = new Error(message);
    (err as Error & { statusCode: number }).statusCode = 403;
    return err;
}

export function assertCanWrite(user: User): void {
    if (!canWrite(user)) throw contentForbidden('You cannot change content in this project.');
}

/** Menus go live as soon as they are saved, so only content leads, admins and builders may change them. */
export function assertCanEditMenus(user: User): void {
    if (!hasRole(user, 'lead') && !hasRole(user, 'builder'))
        throw contentForbidden('Only a content lead, an admin or a builder can change menus.');
}

/** Actions reserved to content leads and admins: permanent deletion, media setup, and managing other people's comments. */
export function assertContentLead(user: User, doing: string): void {
    if (!hasRole(user, 'lead'))
        throw contentForbidden(`Only a content lead or an admin can ${doing}.`);
}

/** Actions that change the whole project at once, such as its schemas or a full bundle. Admins only. */
export function assertProjectAdmin(user: User, doing: string): void {
    if (!hasRole(user, 'admin')) throw contentForbidden(`Only the project's admins can ${doing}.`);
}

export function assertCanEdit(user: User): void {
    if (!canWrite(user) && !canTranslate(user))
        throw contentForbidden('You cannot edit content in this project.');
}

export function assertCanSubmit(user: User): void {
    if (!canWrite(user) && !canTranslate(user))
        throw contentForbidden('You cannot submit content for review.');
}

/**
 * Agents that work for review (the default) draft and propose; taking content down, deleting it,
 * or changing what's live without a review is a person's call.
 */
export function assertNotReviewOnly(user: User, doing: string): void {
    if (user.agent?.reviewOnly)
        throw contentForbidden(`An agent can't ${doing}: a person does that.`);
}

/** Form submissions contain personal data from visitors, so only users who can write content may read them. */
export function assertCanReadSubmissions(user: User): void {
    if (!canWrite(user))
        throw contentForbidden("Form submissions are for the project's writers and admins.");
}

export { translatorOnly };

function isPlain(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** True for a locale map: every key is a project language and every value is a string. */
function asLocaleMap(v: unknown, locales: Set<string>): Record<string, string> | undefined {
    if (!isPlain(v)) return undefined;
    const keys = Object.keys(v);
    if (keys.length === 0) return undefined;
    if (!keys.every(k => locales.has(k) && typeof v[k] === 'string')) return undefined;
    return v as Record<string, string>;
}

/**
 * True when `after` differs from `before` only in languages other than the default, including
 * inside blocks and structures. Adding or removing a block, or editing the source language, is not.
 */
export function translationOnlyChange(
    before: unknown,
    after: unknown,
    locales: string[],
    defaultLocale: string
): boolean {
    const allowed = new Set(locales.filter(Boolean));
    const walk = (prev: unknown, next: unknown): boolean => {
        if (Object.is(prev, next)) return true;
        if (prev == null && next == null) return true;
        const prevMap = asLocaleMap(prev, allowed);
        const nextMap = asLocaleMap(next, allowed);
        if (prevMap || nextMap) {
            if ((prev != null && !prevMap) || (next != null && !nextMap)) return false;
            const source = (prevMap?.[defaultLocale] ?? '') === (nextMap?.[defaultLocale] ?? '');
            return source;
        }
        if (Array.isArray(prev) || Array.isArray(next)) {
            if (!Array.isArray(prev) || !Array.isArray(next) || prev.length !== next.length)
                return false;
            return prev.every((item, i) => walk(item, next[i]));
        }
        if (isPlain(prev) && isPlain(next)) {
            const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
            for (const key of keys) if (!walk(prev[key], next[key])) return false;
            return true;
        }
        return false;
    };
    return walk(before ?? {}, after ?? {});
}
