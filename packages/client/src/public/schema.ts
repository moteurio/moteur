/**
 * What a typed client knows of a project: its languages, and what each model and page holds,
 * once as stored (`all`: a value per language) and once in one language (`one`: read with a
 * locale). `moteur types` writes it as `MoteurSchema`:
 *
 *     const moteur = createMoteurPublicClient<MoteurSchema>({ … });
 *     const fr = moteur.locale('fr');
 *     const pages = await fr.channel('site').pages.list();   // AnyPage<'one'>[]
 */
export type LocaleMode = 'all' | 'one';

export interface ContentShape {
    /** Each model's entry type, by model id. */
    models: object;
    /** The settings models (one entry each), by model id. */
    settings?: object;
    /** Any page of the project. */
    pages: unknown;
}

export interface SchemaShape {
    locale: string;
    all: ContentShape;
    one: ContentShape;
}

/** An entry as delivery gives it, when the client has no generated schema. */
export interface DeliveredEntry {
    id: string;
    type: string;
    status?: string;
    data: Record<string, unknown>;
    meta?: Record<string, unknown>;
    resolvedUrl?: string;
    /** The languages it is in (the default always). Left out: every language. */
    languages?: string[];
    /** The language it was delivered in: the one read, or the default when it isn't in that one. */
    locale?: string;
    /** Fields with nothing in that language, shown in the default's. */
    fallbacks?: string[];
}

/** A page as delivery gives it, when the client has no generated schema. */
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
    /** Its address: in the language read, otherwise the default language's. */
    path: string;
    /** Its address in each language it is in. */
    paths: Record<string, string>;
    fields: Record<string, unknown>;
    /** The languages it is in (the default always). Left out: every language. */
    languages?: string[];
    /** The language it was delivered in: the one read, or the default when it isn't in that one. */
    locale?: string;
    /** Fields with nothing in that language, shown in the default's. */
    fallbacks?: string[];
    [key: string]: unknown;
}

/** Without a generated schema: answers typed loosely, as the API gives them. */
export interface UntypedSchema {
    locale: string;
    all: { models: Record<string, DeliveredEntry>; pages: DeliveredPage };
    one: { models: Record<string, DeliveredEntry>; pages: DeliveredPage };
}

/** The project's model ids. */
export type ModelId<S extends SchemaShape> = Extract<keyof S['all']['models'], string>;

/** The settings models' ids (from `moteur types`); any model's without a generated schema. */
export type SettingsId<S extends SchemaShape> = S['all'] extends { settings: infer T }
    ? Extract<keyof T, string>
    : ModelId<S>;

/** A model's entry, in a locale mode. */
export type EntryOf<S extends SchemaShape, K, M extends LocaleMode> = K extends keyof S[M]['models']
    ? S[M]['models'][K]
    : never;

/** Any page, in a locale mode. */
export type PageOf<S extends SchemaShape, M extends LocaleMode> = S[M]['pages'];

/** A call that names a language answers in it (`'one'`); otherwise the client's own mode. */
export type ModeOf<O, D extends LocaleMode> = O extends { locale: string } ? 'one' : D;
