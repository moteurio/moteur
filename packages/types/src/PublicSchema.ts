/** Text as stored: a single string, or a map from locale code to string such as `{ en, fr }`. */
export type Localizable = string | Record<string, string>;

/**
 * A field as exposed by a channel: its type, its label, and only the options that describe its
 * value (required, multilingual, choices, relation target, limits). Presentation options for
 * editing UIs and plugin settings are omitted. It has the same shape as a stored field.
 */
export interface PublicField {
    type: string;
    label?: Localizable;
    description?: Localizable;
    options?: Record<string, unknown>;
    /** The fields of an object field. */
    fields?: Record<string, PublicField>;
}

export interface PublicModel {
    id: string;
    label: Localizable;
    description?: Localizable;
    modelType?: string;
    urlPattern?: string;
    /** Only the fields that the channel delivers. */
    fields: Record<string, PublicField>;
}

export interface PublicTemplate {
    id: string;
    label: Localizable;
    description?: Localizable;
    fields: Record<string, PublicField>;
}

export interface PublicBlock {
    type: string;
    label: Localizable;
    description?: Localizable;
    category?: string;
    variantHints?: string[];
    fields: Record<string, PublicField>;
}

export interface PublicStructure {
    type: string;
    label: Localizable;
    description?: Localizable;
    fields: Record<string, PublicField>;
}

/**
 * A description of what a channel delivers: its models, its page templates, and the blocks and
 * structures they use. It can be read with the channel's key at `GET …/channels/:id/schema`.
 */
export interface PublicSchema {
    /** Changes whenever any other part of the schema changes. It is also used as the `ETag`. */
    version: string;
    projectId: string;
    channelId: string;
    defaultLocale: string;
    locales: string[];
    /** Models keyed by model ID. */
    models: Record<string, PublicModel>;
    /** Templates keyed by template ID. */
    templates: Record<string, PublicTemplate>;
    /** Blocks keyed by block type, for example `www-moteur/hero`. */
    blocks: Record<string, PublicBlock>;
    /** Structures keyed by structure type. */
    structures: Record<string, PublicStructure>;
}
