import type { Field } from '@moteurio/types/Field.js';
import type { PageNode, StaticPage, CollectionPage } from '@moteurio/types/Page.js';
import type { TemplateSchema } from '@moteurio/types/Template.js';
import { publicPages } from './pages/publishedPages.js';
import { listPages, urlLanguagesFor } from './pages.js';
import { getProjectById } from './projects.js';
import { listTemplates } from './templates.js';
import { localizeFields } from './entryLocaleResolution.js';
import { buildNodeMap, resolveNodePrefix } from './pages/urlResolver.js';
import { fieldWalkSchemas, walkFields, type FieldWalkSchemas } from './fieldWalk.js';
import { isPlainObject } from './validators/fieldValueUtils.js';

/** A page a link or a relation can point at: one with content, not a folder. */
export type LinkablePage = StaticPage | CollectionPage;

export type PageLinkOptions = {
    /** Whether a page may be shown to this reader: delivery passes its status filter. */
    isLive: (page: LinkablePage) => boolean;
    /** One language: each address becomes the string in it. Without, one address per language. */
    locale?: string;
};

/** A page relation as delivered: who it is, where it lives, and the fields the field asked for. */
export type PageSummary = {
    id: string;
    label: string;
    url: string | Record<string, string>;
    fields?: Record<string, unknown>;
};

/** Pages and their addresses, read once and shared by every link of a delivery. */
export type PageLinkContext = {
    pages: Map<string, PageNode>;
    urls: (id: string) => Record<string, string>;
    defaultLocale: string;
    schemas: FieldWalkSchemas;
    /** By id: what a summary's fields are, to bring them down to one language. */
    templates?: Map<string, TemplateSchema>;
};

export async function pageLinkContext(
    projectId: string,
    options?: { published?: boolean }
): Promise<PageLinkContext> {
    // Links lead where the site's pages are: their published versions, outside a preview.
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
            for (const locale of locales)
                found[locale] = resolveNodePrefix(id, pages, {
                    locale,
                    defaultLocale: languages.defaultLocale,
                    prefix: languages.prefix
                });
            cache.set(id, found);
        }
        return found;
    };
    return {
        pages,
        urls,
        defaultLocale: languages.defaultLocale,
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
 *   are gone or not live are left out (a single relation becomes null).
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
            return page
                ? { ...link, url: addressOf(page.id, ctx, options.locale) }
                : { ...link, missing: true };
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
