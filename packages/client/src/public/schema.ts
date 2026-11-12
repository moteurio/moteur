/**
 * Whether values are returned for all locales (`all`, one value per locale as stored) or for a
 * single locale (`one`, when read with a locale).
 *
 * A typed client uses the project's schema, which describes its locales and the contents of each
 * model and page in both modes. `moteur types` generates it as `MoteurSchema`:
 *
 *     const moteur = createMoteurPublicClient<MoteurSchema>({ … });
 *     const fr = moteur.locale('fr');
 *     const pages = await fr.channel('site').pages.list();   // AnyPage<'one'>[]
 */
export type LocaleMode = 'all' | 'one';

export interface ContentShape {
    /** The entry type of each model, keyed by model ID. */
    models: object;
    /** The settings models, which have one entry each, keyed by model ID. */
    settings?: object;
    /** The type of any page in the project. */
    pages: unknown;
}

export interface SchemaShape {
    locale: string;
    all: ContentShape;
    one: ContentShape;
}

/** An entry as returned by the delivery API, used when the client has no generated schema. */
export interface DeliveredEntry {
    id: string;
    type: string;
    status?: string;
    data: Record<string, unknown>;
    meta?: Record<string, unknown>;
    resolvedUrl?: string;
    /** Locales the entry exists in. The default locale is always included. When omitted, the entry exists in every locale. */
    languages?: string[];
    /** The locale the entry was delivered in: the requested locale, or the default locale when the entry does not exist in the requested one. */
    locale?: string;
    /** Fields that have no value in the delivered locale and show the default locale's value instead. */
    fallbacks?: string[];
}

/** A page as returned by the delivery API, used when the client has no generated schema. */
export interface DeliveredPage {
    id: string;
    type: 'static' | 'collection';
    label: string;
    slug: string;
    slugs?: Record<string, string>;
    parentId: string | null;
    order: number;
    templateId: string;
    status: 'draft' | 'published';
    /** The page's URL path in the delivered locale, or in the default locale when the page does not exist in the requested one. */
    path: string;
    /** The page's URL path in each locale it exists in, keyed by locale code. */
    paths: Record<string, string>;
    fields: Record<string, unknown>;
    /** Locales the page exists in. The default locale is always included. When omitted, the page exists in every locale. */
    languages?: string[];
    /** The locale the page was delivered in: the requested locale, or the default locale when the page does not exist in the requested one. */
    locale?: string;
    /** Fields that have no value in the delivered locale and show the default locale's value instead. */
    fallbacks?: string[];
    [key: string]: unknown;
}

/** The schema used when none has been generated. Results are typed loosely, as the API returns them. */
export interface UntypedSchema {
    locale: string;
    all: { models: Record<string, DeliveredEntry>; pages: DeliveredPage };
    one: { models: Record<string, DeliveredEntry>; pages: DeliveredPage };
}

/** The IDs of the project's models. */
export type ModelId<S extends SchemaShape> = Extract<keyof S['all']['models'], string>;

/** The IDs of the settings models, from the schema `moteur types` generates. Without a generated schema, any model ID is accepted. */
export type SettingsId<S extends SchemaShape> = S['all'] extends { settings: infer T }
    ? Extract<keyof T, string>
    : ModelId<S>;

/** The entry type of a model, in a locale mode. */
export type EntryOf<S extends SchemaShape, K, M extends LocaleMode> = K extends keyof S[M]['models']
    ? S[M]['models'][K]
    : never;

/** The page type, in a locale mode. */
export type PageOf<S extends SchemaShape, M extends LocaleMode> = S[M]['pages'];

/** The locale mode of a call's result: `'one'` when the call passes a `locale`, otherwise the client's own mode. */
export type ModeOf<O, D extends LocaleMode> = O extends { locale: string } ? 'one' : D;
