/**
 * Astro content loaders that expose a channel's pages and entries as Astro collections. The
 * content is read once at build time.
 *
 *     // src/content.config.ts
 *     const site = createMoteur<MoteurSchema>({ … }).channel('site');
 *     export const collections = {
 *         pages: defineCollection({ loader: moteurPages(site) }),
 *         rivals: defineCollection({ loader: moteurEntries(site, 'rival') })
 *     };
 *
 * Every page and entry is loaded in a single language and typed by the file that `moteur types` generated.
 */
import type { Loader, LoaderContext } from 'astro/loaders';
import { z } from 'astro/zod';
import type {
    DeliveredEntry,
    DeliveredPage,
    LocaleMode,
    ModelId,
    PublicChannel,
    SchemaShape
} from '@moteurio/client';

export type MoteurLoaderOptions<S extends SchemaShape> = {
    /** The languages to load. Defaults to every language of the project. */
    locales?: S['locale'][];
    /**
     * The path of the file that `moteur types` generated, relative to the project root. Defaults to
     * `src/moteur`. Set it to `false` if there is none, and entries are then typed loosely.
     */
    types?: string | false;
    /** Includes each picture's files and sizes in the loaded data. Defaults to true. */
    resolveAssets?: boolean;
};

// Moteur validates the data and the generated types describe it, so no second schema is needed here.
const schema = z.record(z.string(), z.any());

/** Returns the import path to the project's types that Astro's generated `.astro/loaders/<collection>.ts` uses. */
function typesFrom(types: string | false | undefined): string | null {
    if (types === false) return null;
    const file = (types ?? 'src/moteur').replace(/^\.\//, '').replace(/\.ts$/, '');
    return `../../${file}`;
}

/**
 * Caches a channel's languages so that one request serves all the collections a build loads. The
 * cache lasts one minute, so `astro dev` picks up a language added in the CMS on its next reload.
 */
const channelLocales = new WeakMap<object, { at: number; locales: Promise<string[]> }>();

async function localesOf<S extends SchemaShape, D extends LocaleMode>(
    channel: PublicChannel<S, D>,
    options: MoteurLoaderOptions<S>
): Promise<string[]> {
    if (options.locales?.length) return options.locales;
    const kept = channelLocales.get(channel);
    if (kept && Date.now() - kept.at < 60_000) return kept.locales;
    const locales = channel.schema().then(s => s.locales);
    // Do not cache a failed request, so the next call asks again.
    locales.catch(() => channelLocales.delete(channel));
    channelLocales.set(channel, { at: Date.now(), locales });
    return locales;
}

/** Creates the error that stops the build, stating which request failed. */
function failed(what: string, err: unknown): Error {
    const message = err instanceof Error ? err.message : String(err);
    return new Error(`Moteur: could not read ${what}: ${message}`);
}

function put(ctx: LoaderContext, id: string, data: Record<string, unknown>) {
    return ctx
        .parseData({ id, data })
        .then(parsed => ctx.store.set({ id, data: parsed, digest: ctx.generateDigest(data) }));
}

/**
 * Returns the language an item was delivered in. The API falls back to the default language when
 * an item does not exist in the requested one, and says so in the item's `locale`. If the API
 * gives no `locale`, the requested language is assumed.
 */
const deliveredIn = (item: object, asked?: string): string | undefined =>
    (item as { locale?: string }).locale ?? asked;

/**
 * Loads every page of the channel once per language it exists in, keyed by its URL path, as in
 * `getEntry('pages', '/fr/tarifs')`. Each page has `path`, `paths` (the paths of its translations,
 * for `hreflang`), `locale`, and its fields in that language, with links to other pages already
 * converted to URL paths. A page has no copy in a language it does not exist in.
 */
export function moteurPages<S extends SchemaShape, D extends LocaleMode>(
    channel: PublicChannel<S, D>,
    options: MoteurLoaderOptions<S> = {}
): Loader {
    const from = typesFrom(options.types);
    return {
        name: 'moteur-pages',
        createSchema: async () => ({
            schema,
            types: from
                ? `import type { AnyPage, Locale } from '${from}';\nexport type Entry = AnyPage<'one'> & { locale: Locale };\n`
                : `import type { DeliveredPage } from '@moteurio/client';\nexport type Entry = DeliveredPage & { locale: string };\n`
        }),
        load: async ctx => {
            let pages = 0;
            const locales = await localesOf(channel, options).catch(err => {
                throw failed('the channel’s languages', err);
            });
            ctx.store.clear();
            for (const locale of locales) {
                const list = (await channel.pages
                    .list({ locale, resolveAssets: options.resolveAssets ?? true })
                    .catch(err => {
                        throw failed(`the pages in ${locale}`, err);
                    })) as DeliveredPage[];
                for (const page of list) {
                    if (!page.path || page.type === ('folder' as string)) continue;
                    // The page was delivered in the default language because it has no translation in this one, so skip it.
                    if (deliveredIn(page, locale) !== locale) continue;
                    if (ctx.store.has(page.path)) {
                        ctx.logger.warn(`Two pages at ${page.path}: kept the first.`);
                        continue;
                    }
                    await put(ctx, page.path, { ...page, locale });
                    pages++;
                }
            }
            ctx.logger.info(`${pages} pages (${locales.join(', ')})`);
        }
    };
}

/**
 * Loads every entry of a model in each language it exists in. With one language, an entry's id is
 * its own (`sanity`). With several languages, the id is prefixed with the language (`fr/sanity`).
 * Each entry has `locale`, and `resolvedUrl` when a collection page gives entries a URL.
 */
export function moteurEntries<S extends SchemaShape, D extends LocaleMode, K extends ModelId<S>>(
    channel: PublicChannel<S, D>,
    model: K,
    options: MoteurLoaderOptions<S> = {}
): Loader {
    const from = typesFrom(options.types);
    return {
        name: 'moteur-entries',
        createSchema: async () => ({
            schema,
            types: from
                ? `import type { Models, Locale } from '${from}';\nexport type Entry = Models<'one'>[${JSON.stringify(model)}] & { locale: Locale };\n`
                : `import type { DeliveredEntry } from '@moteurio/client';\nexport type Entry = DeliveredEntry & { locale: string };\n`
        }),
        load: async ctx => {
            let entries = 0;
            const locales = await localesOf(channel, options).catch(err => {
                throw failed('the channel’s languages', err);
            });
            ctx.store.clear();
            for (const locale of locales) {
                const list = (await channel.entries
                    .list(model, {
                        locale,
                        resolveAssets: options.resolveAssets ?? true,
                        resolveUrl: true
                    })
                    .catch(err => {
                        throw failed(`${model} entries in ${locale}`, err);
                    })) as unknown as DeliveredEntry[];
                for (const entry of list) {
                    if (deliveredIn(entry, locale) !== locale) continue;
                    const id = locales.length > 1 ? `${locale}/${entry.id}` : entry.id;
                    await put(ctx, id, { ...entry, locale });
                    entries++;
                }
            }
            ctx.logger.info(`${entries} ${model} entries (${locales.join(', ')})`);
        }
    };
}
