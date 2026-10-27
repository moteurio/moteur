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
    UntypedSchema
} from './schema.js';

/** For any read: one language (the answer is in it), and pictures with their files. */
export type ReadOptions<S extends SchemaShape = UntypedSchema> = {
    locale?: S['locale'];
    resolveAssets?: boolean;
};

export type EntryReadOptions<S extends SchemaShape = UntypedSchema> = ReadOptions<S> & {
    /** Add `resolvedUrl`: the entry's address, when a collection page gives it one. */
    resolveUrl?: boolean;
};

export type EntryListOptions<S extends SchemaShape = UntypedSchema> = EntryReadOptions<S> & {
    limit?: number;
    offset?: number;
    /** `id`, `createdAt`, `updatedAt` or `publishedAt`, `-` first for descending. */
    sort?: string;
};

/**
 * What a channel delivers: pages, entries, menus, forms and layouts. Typed by the
 * project's schema (`S`); answers are in one language (`'one'`) when the call names one, or
 * when the client was made for one (`client.locale('fr')`).
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
    /** Menus with item addresses resolved, by handle (`header`, `footer`). */
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
    /** What the channel delivers, described: each model, template, block and structure. */
    schema(): Promise<PublicSchema>;
}

/** The query of a read: the call's options over the client's own language. */
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
 * A public channel. Paths match `GET` routes in
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
    // Typed by PublicChannel; the HTTP call itself doesn't know the schema.
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
