import type { ResolvedNavigation } from '@moteurio/types/Navigation.js';
import type { PublicSchema } from '@moteurio/types/PublicSchema.js';
import type { MoteurClient } from '../client.js';
import type { PublicForm } from './forms.js';
import type {
    EntryOf,
    LocaleMode,
    ModeOf,
    ModelId,
    PageOf,
    SchemaShape,
    UntypedSchema,
    SettingsId
} from './schema.js';

/** Options for any read: `locale` returns values in that single locale, and `resolveAssets` includes each image's file data. */
export type ReadOptions<S extends SchemaShape = UntypedSchema> = {
    locale?: S['locale'];
    resolveAssets?: boolean;
};

export type EntryReadOptions<S extends SchemaShape = UntypedSchema> = ReadOptions<S> & {
    /** When true, adds `resolvedUrl`, the entry's URL, if a collection page defines one for it. */
    resolveUrl?: boolean;
};

export type EntryListOptions<S extends SchemaShape = UntypedSchema> = EntryReadOptions<S> & {
    limit?: number;
    offset?: number;
    /** Sort key: `id`, `createdAt`, `updatedAt` or `publishedAt`. Prefix it with `-` for descending order. */
    sort?: string;
};

/**
 * Read access to a channel's content: pages, entries, menus, forms and layouts. Types come from
 * the project's schema (`S`). Values are returned in a single locale (`'one'`) when the call
 * passes a `locale`, or when the client was created for one (`client.locale('fr')`).
 */
export interface PublicChannel<
    S extends SchemaShape = UntypedSchema,
    D extends LocaleMode = 'all'
> {
    pages: {
        list<O extends ReadOptions<S>>(options?: O): Promise<PageOf<S, ModeOf<O, D>>[]>;
        getBySlug<O extends ReadOptions<S>>(
            slug: string,
            options?: O
        ): Promise<PageOf<S, ModeOf<O, D>>>;
        get<O extends ReadOptions<S>>(id: string, options?: O): Promise<PageOf<S, ModeOf<O, D>>>;
    };
    entries: {
        list<K extends ModelId<S>, O extends EntryListOptions<S>>(
            model: K,
            options?: O
        ): Promise<EntryOf<S, K, ModeOf<O, D>>[]>;
        get<K extends ModelId<S>, O extends EntryReadOptions<S>>(
            model: K,
            id: string,
            options?: O
        ): Promise<EntryOf<S, K, ModeOf<O, D>>>;
    };
    /**
     * Returns the single entry of a settings model, such as the site settings or interface
     * strings. Settings models have exactly one entry, so no ID is needed and there is no list.
     */
    settings<K extends SettingsId<S>, O extends EntryReadOptions<S>>(
        model: K,
        options?: O
    ): Promise<EntryOf<S, K, ModeOf<O, D>>>;
    /** Menus with item URLs resolved, identified by handle (for example `header` or `footer`). */
    menus: {
        list(options?: { locale?: S['locale'] }): Promise<ResolvedNavigation[]>;
        get(handle: string, options?: { locale?: S['locale'] }): Promise<ResolvedNavigation>;
    };
    forms: {
        list(options?: { locale?: S['locale'] }): Promise<PublicForm[]>;
        get(id: string, options?: { locale?: S['locale'] }): Promise<PublicForm>;
    };
    layouts: {
        list(): Promise<Record<string, unknown>[]>;
        get(id: string): Promise<Record<string, unknown>>;
    };
    /** Returns a description of what the channel delivers: each model, template, block and structure. */
    schema(): Promise<PublicSchema>;
}

/** Builds the query parameters of a read. The call's `locale` takes precedence over the client's locale. */
function query(
    options: EntryListOptions | undefined,
    locale: string | undefined
): Record<string, string> | undefined {
    const o: Record<string, string> = {};
    const lang = options?.locale ?? locale;
    if (lang) o.locale = lang;
    if (options?.resolveAssets) o.resolveAssets = '1';
    if (options?.resolveUrl) o.resolveUrl = '1';
    if (options?.limit != null) o.limit = String(options.limit);
    if (options?.offset != null) o.offset = String(options.offset);
    if (options?.sort) o.sort = options.sort;
    return Object.keys(o).length ? o : undefined;
}

/**
 * Creates a public channel. Its request paths match the `GET` routes in
 * `packages/api/src/projects/channels/public.ts`.
 */
export function createPublicChannel<
    S extends SchemaShape = UntypedSchema,
    D extends LocaleMode = 'all'
>(
    client: MoteurClient,
    projectId: string,
    channelId: string,
    locale?: string
): PublicChannel<S, D> {
    const enc = encodeURIComponent;
    const root = `/projects/${enc(projectId)}/channels/${enc(channelId)}`;
    // The `PublicChannel` interface provides the types. The HTTP call itself has no knowledge of the schema.
    const get = (url: string, options?: EntryListOptions) =>
        client.get<never>(url, query(options, locale));

    return {
        pages: {
            list: options => get(`${root}/pages`, options),
            getBySlug: (slug, options) => get(`${root}/pages/by-slug/${enc(slug)}`, options),
            get: (id, options) => get(`${root}/pages/${enc(id)}`, options)
        },
        entries: {
            list: (model, options) => get(`${root}/${enc(model)}/entries`, options),
            get: (model, id, options) => get(`${root}/${enc(model)}/entries/${enc(id)}`, options)
        },
        settings: (model, options) => get(`${root}/settings/${enc(model)}`, options),
        menus: {
            list: options => get(`${root}/menus`, options),
            get: (handle, options) => get(`${root}/menus/${enc(handle)}`, options)
        },
        forms: {
            list: options => get(`${root}/forms`, options),
            get: (id, options) => get(`${root}/forms/${enc(id)}`, options)
        },
        layouts: {
            list: () => get(`${root}/layouts`),
            get: id => get(`${root}/layouts/${enc(id)}`)
        },
        schema: () => client.get<PublicSchema>(`${root}/schema`)
    };
}
