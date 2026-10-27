/** Text as stored: one string, or one per language (`{ en, fr }`). */
export type Localizable = string | Record<string, string>;

/**
 * A field as a channel shows it: its type, what it's called, and only the options that explain
 * its value (required, multilingual, choices, what a relation points at, limits). Studio's
 * presentation options and plugins' settings are left out. Same shape as a stored field.
 */
export interface PublicField {
    type: string;
    label?: Localizable;
    description?: Localizable;
    options?: Record<string, unknown>;
    /** An object's fields. */
    fields?: Record<string, PublicField>;
}

export interface PublicModel {
    id: string;
    label: Localizable;
    description?: Localizable;
    modelType?: string;
    urlPattern?: string;
    /** Only the fields the channel delivers. */
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
 * What a channel delivers, described: its models, the templates of its pages, and the blocks and
 * structures they use. Readable with the channel's key (`GET …/channels/:id/schema`).
 */
export interface PublicSchema {
    /** Changes whenever anything here does (also the `ETag`). */
    version: string;
    projectId: string;
    channelId: string;
    defaultLocale: string;
    locales: string[];
    /** By model id. */
    models: Record<string, PublicModel>;
    /** By template id. */
    templates: Record<string, PublicTemplate>;
    /** By block type (`moteur-io/hero`). */
    blocks: Record<string, PublicBlock>;
    /** By structure type. */
    structures: Record<string, PublicStructure>;
}
