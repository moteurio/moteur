/** Returns the text of a multilingual field for a locale, falling back to `fallbackLocale`. Returns an empty string when neither exists. */
export function t(value: unknown, locale: string, fallbackLocale = 'en'): string {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const o = value as Record<string, unknown>;
        const v = o[locale] ?? o[fallbackLocale];
        if (typeof v === 'string') return v;
        if (v != null) return String(v);
    }
    return '';
}

/**
 * Returns the pathname for the other locale (`fr` and `en` are swapped), replacing the locale
 * prefix and, when `segments` are given, the localized slug segment.
 */
export function siblingPath(
    pathname: string,
    currentLocale: string,
    segments?: Record<string, string> | null
): string {
    const sibling = currentLocale === 'fr' ? 'en' : 'fr';
    let path = pathname.replace(`/${currentLocale}/`, `/${sibling}/`);
    if (segments && segments[currentLocale] !== segments[sibling]) {
        path = path.replace(`/${segments[currentLocale]}/`, `/${segments[sibling]}/`);
    }
    return path;
}

export function localeFromPathname(pathname: string, defaultLocale = 'fr'): string {
    const m = pathname.match(/^\/(fr|en)(\/|$)/);
    return m ? m[1] : defaultLocale;
}
