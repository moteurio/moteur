/**
 * Astro content loaders: a channel's pages and entries as Astro collections, read once at build.
 *
 *     // src/content.config.ts
 *     const site = createMoteur<MoteurSchema>({ … }).channel('site');
 *     export const collections = {
 *         pages: defineCollection({ loader: moteurPages(site) }),
 *         rivals: defineCollection({ loader: moteurEntries(site, 'rival') })
 *     };
 *
 * Every page and entry comes in one language, typed by the file `moteur types` wrote.
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
    /** Which languages to load (default: every language of the project). */
    locales?: S['locale'][];
    /**
     * Where `moteur types` wrote the project's types, from the project's root (default
     * `src/moteur`). `false` when there are none: entries are then typed loosely.
     */
    types?: string | false;
    /** Pictures come with their files and sizes (default true). */
    resolveAssets?: boolean;
};

// Data is checked by Moteur and typed by the generated types, not by a second schema here.
const schema = z.record(z.string(), z.any());

/** The import Astro's generated `.astro/loaders/<collection>.ts` uses for the project's types. */
function typesFrom(types: string | false | undefined): string | null {
    if (types === false) return null;
    const file = (types ?? 'src/moteur').replace(/^\.\//, '').replace(/\.ts$/, '');
    return `../../${file}`;
}

/**
 * A channel's languages, asked once for all the collections a build loads. Kept a minute, so
 * `astro dev` sees a language added in Studio on its next reload.
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
    // A failed read is asked again next time, not kept.
    locales.catch(() => channelLocales.delete(channel));
    channelLocales.set(channel, { at: Date.now(), locales });
    return locales;
}

/** What failed, said once and clearly: the build stops there. */
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
 * The language an item came in: the one asked for, or the default when it isn't in that one
 * (`languages`). An API that doesn't say is taken at its word.
 */
const deliveredIn = (item: object, asked?: string): string | undefined =>
    (item as { locale?: string }).locale ?? asked;

/**
 * Every page of the channel, once per language it is in, by its address:
 * `getEntry('pages', '/fr/tarifs')`. Each has `path`, `paths` (its languages, for `hreflang`),
 * `locale`, and its fields in that language, links to other pages already turned into addresses.
 * A page not in a language has no copy in it.
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
                    // Not in this language (it came in the default one): no page for it here.
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
 * Every entry of a model, in each language it is in. With one language an entry's id is its own
 * (`sanity`); with several, the language comes first (`fr/sanity`). Each has `locale`, and
 * `resolvedUrl` when a collection page gives entries an address.
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
