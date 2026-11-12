/** Validates the `languages` list of a page or entry, which says which languages the item exists in. */
import type { ProjectSchema } from '@moteurio/types/Project.js';

/**
 * Validates a page's or entry's `languages` list against the project's languages. The list may
 * name the default language, which an item is always available in. An empty list or null means
 * the item exists in every language, so no list is stored.
 */
export function normalizeLanguages(
    languages: unknown,
    project: ProjectSchema | null | undefined
): string[] | undefined {
    if (languages === undefined || languages === null) return undefined;
    if (!Array.isArray(languages) || languages.some(l => typeof l !== 'string'))
        throw Object.assign(
            new Error('languages is a list of the project’s languages, e.g. ["en", "fr"].'),
            { status: 400, code: 'LANGUAGES_INVALID' }
        );
    const defaultLocale = project?.defaultLocale || 'en';
    const locales = project?.supportedLocales ?? [];
    const unknown = languages.filter(l => l !== defaultLocale && !locales.includes(l));
    if (unknown.length)
        throw Object.assign(
            new Error(
                `${unknown.map(l => `"${l}"`).join(', ')} is not one of this project's languages.`
            ),
            { status: 400, code: 'LANGUAGES_INVALID' }
        );
    return languages.length ? [...new Set([defaultLocale, ...languages])] : undefined;
}
