import type { ModelSchema } from './Model.js';
import type { TemplateSchema } from './Template.js';
import type { BlockSchema } from './Block.js';
import type { StructureSchema } from './Structure.js';
import type { FormSchema } from './Form.js';

/**
 * A set of project content saved in a single all-or-nothing operation: schemas, files, pages,
 * entries, menus and redirects. Inside the bundle, `{ "$ref": "page:pricing" }` (or
 * `entry:<model>/<ref>`, `asset:<ref>`) refers to the ID of an item in the bundle or already in
 * the project. This lets links, relations, images and parents point at items that do not exist
 * yet.
 */
export interface ImportBundle {
    version: 1;
    /** What to do with an item whose ID already exists: `update` it (default), `skip` it, or `fail` the import. */
    existing?: 'update' | 'skip' | 'fail';
    /**
     * When true, every page and entry is published after it is saved. Otherwise only items with
     * `published` set are. An import made by an agent waits for a person's approval in either case.
     */
    publish?: boolean;
    structures?: StructureSchema[];
    blocks?: BlockSchema[];
    models?: ModelSchema[];
    /** Templates in the shape the templates API accepts. The import sets the project and the timestamps. */
    templates?: Omit<TemplateSchema, 'projectId' | 'createdAt' | 'updatedAt'>[];
    assets?: ImportAsset[];
    pages?: ImportPage[];
    /** Entries keyed by model ID. */
    entries?: Record<string, ImportEntry[]>;
    menus?: ImportMenu[];
    redirects?: ImportRedirect[];
    /** Forms that collect submissions from site visitors (see the Forms guide). */
    forms?: ImportForm[];
}

/** A form in the shape the forms API accepts. `status` defaults to `active`. */
export type ImportForm = Omit<FormSchema, 'createdAt' | 'updatedAt' | 'status'> &
    Partial<Pick<FormSchema, 'status'>>;

/** A file to import, given either as a public HTTPS `url` or as base64 `content` with a `name`. */
export interface ImportAsset {
    /** Name other items in the bundle use to refer to this asset: `{ "$ref": "asset:<ref>" }`. */
    ref: string;
    url?: string;
    content?: string;
    name?: string;
    folder?: string;
    alt?: string;
    title?: string;
    credit?: string;
}

export interface ImportPage {
    /** Page ID. It is preserved when given; otherwise one is generated. */
    id?: string;
    /** Name other items in the bundle use to refer to this page: `{ "$ref": "page:<ref>" }`. Defaults to the page ID. */
    ref?: string;
    /** Ref or ID of the parent page. */
    parent?: string | { $ref: string };
    type?: 'static' | 'collection' | 'folder';
    templateId?: string;
    label: string;
    slug: string;
    slugs?: Record<string, string>;
    order?: number;
    navInclude?: boolean;
    navLabel?: string;
    sitemapInclude?: boolean;
    modelId?: string;
    urlPattern?: string;
    fields?: Record<string, unknown>;
    /** Locales the page exists in. The default locale is always included. When omitted, every locale is used. */
    languages?: string[];
    /** When true, the page is published after it is saved. An export records which pages were published. */
    published?: boolean;
}

export interface ImportEntry {
    id: string;
    /** Name other items in the bundle use to refer to this entry: `{ "$ref": "entry:<model>/<ref>" }`. Defaults to the entry ID. */
    ref?: string;
    data: Record<string, unknown>;
    /** Locales the entry exists in. The default locale is always included. When omitted, every locale is used. */
    languages?: string[];
    /** When true, the entry is published after it is saved. An export records which entries were published. */
    published?: boolean;
}

export interface ImportMenu {
    handle: string;
    label?: unknown;
    maxDepth?: number;
    items?: unknown[];
    [key: string]: unknown;
}

export interface ImportRedirect {
    from: string;
    to: string;
    status?: 301 | 302;
    note?: string;
}

export type ImportItemKind =
    | 'structure'
    | 'block'
    | 'model'
    | 'template'
    | 'asset'
    | 'page'
    | 'entry'
    | 'menu'
    | 'redirect'
    | 'form';

/** The result for one item that the import created, updated or skipped (or would, in a dry run). */
export interface ImportItemResult {
    kind: ImportItemKind;
    /** ID of the item once saved. For an entry this is `<model>/<id>`. */
    id: string;
    action: 'create' | 'update' | 'skip';
}

/** A problem in the bundle or a failed save. */
export interface ImportIssue {
    /** Location in the bundle, for example `pages[3].fields.hero` or `entries.article[0]`. */
    path: string;
    message: string;
}

export type ImportStatus =
    | 'running'
    | 'done'
    | 'failed'
    /** Saved as drafts. A person must approve them to publish. */
    | 'awaiting_approval';

/**
 * The items an import publishes: its pages and entries (when `publish` is set), plus menus from
 * an agent that requires review. A menu is live as soon as it is saved, so those menus are held
 * until a person approves.
 */
export interface ImportToPublish {
    pages: string[];
    entries: { modelId: string; id: string }[];
    menus?: { handle: string; name: string; data: Record<string, unknown> }[];
}

export interface ImportJob {
    id: string;
    projectId: string;
    status: ImportStatus;
    dryRun: boolean;
    createdAt: string;
    finishedAt?: string;
    by: { id: string; name?: string; agent?: string };
    /** Import progress: the number of items saved out of the total. */
    progress: { done: number; total: number };
    items: ImportItemResult[];
    issues: ImportIssue[];
    /** Informational messages that are not errors, such as content dropped from imported HTML (`2 pictures left out`) or links created to pages. */
    notes?: ImportIssue[];
    /** The commit that contains everything the import saved. */
    commit?: string;
    /** The items that are published on approval, or that were published. */
    toPublish?: ImportToPublish;
    approvedBy?: { id: string; name?: string };
}
