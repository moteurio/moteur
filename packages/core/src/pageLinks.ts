import type { Field } from '@moteurio/types/Field.js';
import type { PageNode, StaticPage, CollectionPage } from '@moteurio/types/Page.js';
import type { TemplateSchema } from '@moteurio/types/Template.js';
import { publicPages } from './pages/publishedPages.js';
import { listPages, urlLanguagesFor } from './pages.js';
import { getProjectById } from './projects.js';
import { listTemplates } from './templates.js';
import { localizeFields } from './entryLocaleResolution.js';
import { buildNodeMap, resolveNodePrefix, inLanguage } from './pages/urlResolver.js';
import { fieldWalkSchemas, walkFields, type FieldWalkSchemas } from './fieldWalk.js';
import { perVersion } from './deliveryCache.js';
import { fillTextLinks, pagesLinkedIn } from './textLinks.js';
import { isPlainObject } from './validators/fieldValueUtils.js';

/** A page that a link or relation can point at. Folders have no content, so they are excluded. */
export type LinkablePage = StaticPage | CollectionPage;

export type PageLinkOptions = {
    /** Whether the page may be shown to this reader; delivery passes its status filter here. */
    isLive: (page: LinkablePage) => boolean;
    /**
     * With a locale, each address is a single string in that language. Without one, each address
     * maps locale to string.
     */
    locale?: string;
};

/** A page relation as delivered: its id, label, address and the fields the relation field requested. */
export type PageSummary = {
    id: string;
    label: string;
    url: string | Record<string, string>;
    fields?: Record<string, unknown>;
};

/** Pages and their addresses, loaded once and shared by every link in a delivery. */
export type PageLinkContext = {
    pages: Map<string, PageNode>;
    urls: (id: string) => Record<string, string>;
    defaultLocale: string;
    /** The project's languages, default first. */
    locales: string[];
    schemas: FieldWalkSchemas;
    /** Templates by id, used to reduce a summary's fields to a single language. */
    templates?: Map<string, TemplateSchema>;
};

export function pageLinkContext(
    projectId: string,
    options?: { published?: boolean }
): Promise<PageLinkContext> {
    // Cache the context per project version, so it is built once until the project changes (see
    // deliveryCache.ts).
    return perVersion(projectId, `pageLinks:${options?.published ? 'published' : 'latest'}`, () =>
        buildPageLinkContext(projectId, options)
    );
}

async function buildPageLinkContext(
    projectId: string,
    options?: { published?: boolean }
): Promise<PageLinkContext> {
    // Outside a preview, links point at the published versions of pages, which is what the site serves.
    const nodes = options?.published
        ? await publicPages(projectId, await listPages(projectId))
        : await listPages(projectId);
    const pages = buildNodeMap(nodes);
    const languages = urlLanguagesFor(await getProjectById(projectId));
    const locales = [...new Set([languages.defaultLocale, ...languages.locales])];
    const cache = new Map<string, Record<string, string>>();
    const urls = (id: string) => {
        let found = cache.get(id);
        if (!found) {
            found = {};
            const page = pages.get(id);
            for (const locale of locales) {
                const lang = {
                    locale,
                    defaultLocale: languages.defaultLocale,
                    prefix: languages.prefix
                };
                // Only record languages the page exists in. A link in any other language falls back
                // to the default language's address.
                if (inLanguage(page, lang)) found[locale] = resolveNodePrefix(id, pages, lang);
            }
            cache.set(id, found);
        }
        return found;
    };
    return {
        pages,
        urls,
        defaultLocale: languages.defaultLocale,
        locales,
        schemas: await fieldWalkSchemas(projectId),
        templates: new Map((await listTemplates(projectId)).map(t => [t.id, t]))
    };
}

/** The page's address for this reader: in their language, or one per language. */
function addressOf(
    id: string,
    ctx: PageLinkContext,
    locale?: string
): string | Record<string, string> {
    const urls = ctx.urls(id);
    if (!locale) return urls;
    return urls[locale] ?? urls[ctx.defaultLocale];
}

/** A link's anchor as it goes after an address: `mac` or `#mac` → `#mac`; nothing → ''. */
const anchorOf = (anchor: unknown): string => {
    const name = typeof anchor === 'string' ? anchor.trim().replace(/^#/, '') : '';
    return name ? `#${name}` : '';
};

/** The page behind an id, when it exists, has content and this reader may see it. */
function liveTarget(id: unknown, ctx: PageLinkContext, options: PageLinkOptions) {
    if (typeof id !== 'string') return null;
    const page = ctx.pages.get(id);
    if (!page || page.type === 'folder') return null;
    return options.isLive(page) ? page : null;
}

/** Relation values hold a page id, or `{ id }`. */
const idOf = (value: unknown): unknown =>
    isPlainObject(value) ? (value as { id?: unknown }).id : value;

async function summaryOf(
    page: LinkablePage,
    field: Field,
    ctx: PageLinkContext,
    options: PageLinkOptions
): Promise<PageSummary> {
    const picked = Array.isArray(field.options?.fields) ? (field.options.fields as string[]) : [];
    const summary: PageSummary = {
        id: page.id,
        label: page.label,
        url: addressOf(page.id, ctx, options.locale)
    };
    if (picked.length > 0) {
        summary.fields = {};
        for (const key of picked) if (key in page.fields) summary.fields[key] = page.fields[key];
        const template = ctx.templates?.get(page.templateId);
        if (options.locale && template)
            summary.fields = await localizeFields(
                summary.fields,
                template.fields as Record<string, Field>,
                ctx.schemas,
                { locale: options.locale, fallback: ctx.defaultLocale },
                0
            );
    }
    return summary;
}

/** True for a relation or relations field pointing at pages rather than a model's entries. */
export const targetsPages = (field: Field): boolean => field.options?.target === 'pages';

/**
 * Fill in what pages a record points at, at any depth (blocks, lists, variants…):
 * - a `core/link` with a `pageId` gets the page's `url`, or `missing: true` and no `url` when the
 *   page is gone, a folder, or not live for this reader;
 * - a `core/relation`/`core/relations` with `target: "pages"` becomes page summaries; pages that
 *   are gone or not live are left out (a single relation becomes null);
 * - links to pages written in rich text and Markdown get the page's address, or lose the link and
 *   keep their words (see textLinks.ts).
 */
export async function resolvePageLinks(
    values: Record<string, unknown> | undefined,
    fields: Record<string, Field> | undefined,
    ctx: PageLinkContext,
    options: PageLinkOptions
): Promise<Record<string, unknown> | undefined> {
    return walkFields(values, fields, ctx.schemas, async (value, field) => {
        if (field.type === 'core/link') {
            if (!isPlainObject(value) || !('pageId' in value)) return undefined;
            const { url: _stale, missing: _m, ...link } = value as Record<string, unknown>;
            const page = liveTarget(link.pageId, ctx, options);
            if (!page) return { ...link, missing: true };
            // Append the anchor (`anchor: "mac"`) to the page address in every language.
            const hash = anchorOf(link.anchor);
            const url = addressOf(page.id, ctx, options.locale);
            return {
                ...link,
                url:
                    typeof url === 'string'
                        ? url + hash
                        : Object.fromEntries(Object.entries(url).map(([l, u]) => [l, u + hash]))
            };
        }
        if (field.type === 'core/rich-text' || field.type === 'core/markdown') {
            const kind = field.type === 'core/rich-text' ? 'dast' : 'markdown';
            if (!pagesLinkedIn(value, kind).length) return value;
            return fillTextLinks(
                value,
                kind,
                (id, locale) => {
                    const page = liveTarget(id, ctx, options);
                    const url = page ? addressOf(page.id, ctx, locale) : undefined;
                    return typeof url === 'string' && url ? url : null;
                },
                { locale: options.locale ?? ctx.defaultLocale, locales: ctx.locales }
            );
        }
        if (field.type === 'core/relation' && targetsPages(field)) {
            const page = liveTarget(idOf(value), ctx, options);
            return page ? await summaryOf(page, field, ctx, options) : null;
        }
        if (field.type === 'core/relations' && targetsPages(field)) {
            if (!Array.isArray(value)) return [];
            const out: PageSummary[] = [];
            for (const item of value) {
                const page = liveTarget(idOf(item), ctx, options);
                if (page) out.push(await summaryOf(page, field, ctx, options));
            }
            return out;
        }
        return undefined;
    });
}
