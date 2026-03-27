/**
 * Shared helpers for normalizing stored field shapes (locale maps, etc.).
 */

export function isPlainObject(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * True if every own value is a string (typical locale map).
 */
export function isLocaleStringMap(v: unknown): v is Record<string, string> {
    if (!isPlainObject(v)) return false;
    const vals = Object.values(v);
    return vals.length > 0 && vals.every(x => typeof x === 'string');
}

/** Locale-ish keys (en, fr, en-CA) to avoid treating arbitrary { foo: "bar" } as translations. */
const LIKELY_LOCALE_KEY = /^[a-z]{2}(-[a-zA-Z]{2,8})?$/;

/**
 * Plain object whose keys look like locale codes and values are strings.
 */
export function isLikelyLocaleStringMap(v: unknown): v is Record<string, string> {
    if (!isPlainObject(v)) return false;
    const keys = Object.keys(v);
    if (keys.length === 0) return false;
    return (
        keys.every(k => LIKELY_LOCALE_KEY.test(k)) &&
        Object.values(v).every(x => typeof x === 'string')
    );
}
