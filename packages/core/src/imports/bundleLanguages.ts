/**
 * Adapts a bundle written in some languages to the languages of a project. A project blueprint's
 * content goes through this before it is imported into a new project.
 *
 * - A per-language value (`{ "en": …, "fr": … }`, at any depth: text, rich text, links, menu
 *   labels, form fields) gets one entry for each of the project's languages. It uses that
 *   language's text if the bundle has it, otherwise the text of the bundle's first language, which
 *   can be translated later. Languages the project does not have are dropped.
 * - A page's `slug` becomes the slug for the project's default language, and `slugs` keeps the
 *   slugs for the other languages the page has.
 * - A `languages` list (a page or entry that exists in only some languages) keeps the languages
 *   the project has. The bundle's first language stands for the project's default language.
 *
 * Schemas (structures, blocks, models, templates) are left unchanged, because their labels are
 * for editors and not part of the site's content.
 */
import type { ImportBundle } from '@moteurio/types/Import.js';

export type BundleLanguages = { defaultLocale: string; locales: string[] };

export function adaptBundleToLanguages(
    bundle: ImportBundle,
    from: string[],
    to: BundleLanguages
): ImportBundle {
    const source = from[0] ?? 'en';
    const target = [...new Set([to.defaultLocale, ...to.locales])];
    const isLanguageMap = (value: unknown): value is Record<string, unknown> => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
        const keys = Object.keys(value);
        return keys.length > 0 && keys.every(k => from.includes(k));
    };
    const adapt = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(adapt);
        if (isLanguageMap(value)) {
            const out: Record<string, unknown> = {};
            for (const lang of target) {
                const v = value[lang] ?? value[source];
                if (v !== undefined) out[lang] = adapt(v);
            }
            return out;
        }
        if (value && typeof value === 'object')
            return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, adapt(v)]));
        return value;
    };
    const languages = (list?: string[]) => {
        if (!list) return undefined;
        const kept = [
            ...new Set(
                list.map(l => (l === source ? to.defaultLocale : l)).filter(l => target.includes(l))
            )
        ];
        return kept.length ? kept : undefined;
    };

    return {
        ...bundle,
        ...(bundle.pages && {
            pages: bundle.pages.map(page => {
                const bySource: Record<string, string> = { ...page.slugs, [source]: page.slug };
                const slugs = Object.fromEntries(
                    target
                        // The home page's empty address is its own in every language: no slug.
                        .filter(l => l !== to.defaultLocale && bySource[l])
                        .map(l => [l, bySource[l]!])
                );
                const { slugs: _s, languages: list, fields, ...rest } = page;
                const kept = languages(list);
                return {
                    ...rest,
                    slug: bySource[to.defaultLocale] ?? page.slug,
                    ...(Object.keys(slugs).length && { slugs }),
                    ...(kept && { languages: kept }),
                    ...(fields && { fields: adapt(fields) as Record<string, unknown> })
                };
            })
        }),
        ...(bundle.entries && {
            entries: Object.fromEntries(
                Object.entries(bundle.entries).map(([model, list]) => [
                    model,
                    list.map(({ languages: l, data, ...entry }) => {
                        const kept = languages(l);
                        return {
                            ...entry,
                            data: adapt(data) as Record<string, unknown>,
                            ...(kept && { languages: kept })
                        };
                    })
                ])
            )
        }),
        ...(bundle.menus && { menus: adapt(bundle.menus) as ImportBundle['menus'] }),
        ...(bundle.forms && { forms: adapt(bundle.forms) as ImportBundle['forms'] })
    };
}
