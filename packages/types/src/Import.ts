import type { ModelSchema } from './Model.js';
import type { TemplateSchema } from './Template.js';
import type { BlockSchema } from './Block.js';
import type { StructureSchema } from './Structure.js';
import type { FormSchema } from './Form.js';

/**
 * Many things saved at once, all or nothing: a project's schemas, files, pages, entries, menus
 * and redirects. Inside it, `{ "$ref": "page:pricing" }` (or `entry:<model>/<ref>`,
 * `asset:<ref>`) stands for the id of something the bundle (or the project) has, so links,
 * relations, pictures and parents can point at what doesn't exist yet.
 */
export interface ImportBundle {
    version: 1;
    /** What to do with something that already exists (same id): change it (default), keep it, or stop. */
    existing?: 'update' | 'skip' | 'fail';
    /**
     * Put every page and entry live once saved. Without it, only those that say `published`.
     * An agent's import waits for a person's approval either way.
     */
    publish?: boolean;
    structures?: StructureSchema[];
    blocks?: BlockSchema[];
    models?: ModelSchema[];
    templates?: TemplateSchema[];
    assets?: ImportAsset[];
    pages?: ImportPage[];
    /** By model id. */
    entries?: Record<string, ImportEntry[]>;
    menus?: ImportMenu[];
    redirects?: ImportRedirect[];
    /** Forms, by id: what a site's visitors send (see the Forms guide). */
    forms?: ImportForm[];
}

/** A form, as the forms API takes it; `status` is `active` unless it says otherwise. */
export type ImportForm = Omit<FormSchema, 'createdAt' | 'updatedAt' | 'status'> &
    Partial<Pick<FormSchema, 'status'>>;

/** A file: from a public HTTPS address, or inline in base64 with its name. */
export interface ImportAsset {
    /** How the bundle names it: `{ "$ref": "asset:<ref>" }`. */
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
    /** Its id (kept). Without, one is made. */
    id?: string;
    /** How the bundle names it (default: its id): `{ "$ref": "page:<ref>" }`. */
    ref?: string;
    /** The parent page's ref or id. */
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
    /** The languages it is in (the default always). Left out: every language. */
    languages?: string[];
    /** Put it live once saved (an export says which were). */
    published?: boolean;
}

export interface ImportEntry {
    id: string;
    /** How the bundle names it (default: its id): `{ "$ref": "entry:<model>/<ref>" }`. */
    ref?: string;
    data: Record<string, unknown>;
    /** The languages it is in (the default always). Left out: every language. */
    languages?: string[];
    /** Put it live once saved (an export says which were). */
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

/** One thing the import did, or would do. */
export interface ImportItemResult {
    kind: ImportItemKind;
    /** Its id once saved (for an entry, `<model>/<id>`). */
    id: string;
    action: 'create' | 'update' | 'skip';
}

/** Something wrong with the bundle, or a save that failed. */
export interface ImportIssue {
    /** Where in the bundle: `pages[3].fields.hero`, `entries.article[0]`. */
    path: string;
    message: string;
}

export type ImportStatus =
    | 'running'
    | 'done'
    | 'failed'
    /** Saved as drafts; a person approves to put them live. */
    | 'awaiting_approval';

/**
 * What an import puts live: its pages and entries (with `publish`), and the menus an agent that
 * works for review brought (a menu is live once saved, so they wait for a person).
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
    /** How far it has come: items saved of the total. */
    progress: { done: number; total: number };
    items: ImportItemResult[];
    issues: ImportIssue[];
    /** Worth saying, not wrong: what HTML lost (`2 pictures left out`), the links it made to pages. */
    notes?: ImportIssue[];
    /** The commit holding everything the import saved. */
    commit?: string;
    /** What goes live on approval (or went live). */
    toPublish?: ImportToPublish;
    approvedBy?: { id: string; name?: string };
}
