import type { User } from '@moteurio/types/User.js';
import { canTranslate, canWrite, translatorOnly } from '@moteurio/types';

/** A refusal the API turns into HTTP 403. */
export function contentForbidden(message: string): Error {
    const err = new Error(message);
    (err as Error & { statusCode: number }).statusCode = 403;
    return err;
}

export function assertCanWrite(user: User): void {
    if (!canWrite(user)) throw contentForbidden('You cannot change content in this project.');
}

export function assertCanEdit(user: User): void {
    if (!canWrite(user) && !canTranslate(user))
        throw contentForbidden('You cannot edit content in this project.');
}

export function assertCanSubmit(user: User): void {
    if (!canWrite(user) && !canTranslate(user))
        throw contentForbidden('You cannot submit content for review.');
}

export { translatorOnly };

function isPlain(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** A locale map: every key is one of the project's languages, every value is text. */
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
