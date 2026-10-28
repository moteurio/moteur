/**
 * TypeScript types for a project's content, from its schemas: what delivery returns for each
 * model, template, block and structure, at any depth. Every type takes a locale mode: `'all'`
 * (as stored, a value per language) or `'one'` (read with `?locale=`, one value).
 */
import type { Field } from '@moteurio/types/Field.js';
import type { ModelSchema } from '@moteurio/types/Model.js';
import type { TemplateSchema } from '@moteurio/types/Template.js';
import type { StructureSchema } from '@moteurio/types/Structure.js';
import type { User } from '@moteurio/types/User.js';
import { listModelSchemas } from './models.js';
import { listTemplates } from './templates.js';
import { listBlocks } from './blocks.js';
import { findStructure, listStructures } from './structures.js';
import { getProjectById } from './projects.js';

/** What types are made from: a project's stored schemas, or a channel's public schema. */
type Described = { label?: unknown; fields?: unknown };
export type TypegenInput = {
    projectId: string;
    defaultLocale: string;
    locales: string[];
    models: Array<Pick<ModelSchema, 'id'> & Described>;
    templates: Array<Pick<TemplateSchema, 'id'> & Described>;
    blocks: Record<string, Described>;
    structures: Record<string, Pick<StructureSchema, 'type'> & Described>;
};

type Fields = Record<string, Field>;

/** A label or description as one line of text (the default language's, or the first). */
function textOf(value: unknown, locale: string): string {
    if (typeof value === 'string') return value.trim();
    if (value && typeof value === 'object') {
        const map = value as Record<string, unknown>;
        const v = map[locale] ?? Object.values(map).find(x => typeof x === 'string');
        return typeof v === 'string' ? v.trim() : '';
    }
    return '';
}

const pascal = (id: string) =>
    id
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean)
        .map(w => w[0]!.toUpperCase() + w.slice(1))
        .join('')
        .replace(/^(\d)/, '_$1') || 'Unnamed';

const quote = (s: string) => JSON.stringify(s);
const key = (k: string) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : quote(k));
const doc = (text: string, indent: string) =>
    text ? `${indent}/** ${text.replace(/\*\//g, '*\\/').replace(/\s+/g, ' ')} */\n` : '';

const required = (f: Field) => f.required === true || f.options?.required === true;
const multilingual = (f: Field) => f.options?.multilingual === true;

const childFieldsOf = (f: Field): Fields | undefined =>
    (f.data as Fields | undefined) ??
    ((f as Field & { fields?: Fields }).fields as Fields | undefined) ??
    ((f as Field & { properties?: Fields }).properties as Fields | undefined);

/** The values a select offers: plain strings or `{ value }`. */
function choicesOf(f: Field): string[] {
    const opts = f.options?.choices ?? f.options?.values ?? f.options?.options;
    if (!Array.isArray(opts)) return [];
    return opts
        .map(c => (typeof c === 'string' ? c : (c as { value?: unknown })?.value))
        .filter((v): v is string => typeof v === 'string');
}

const STRING_TYPES = new Set([
    'core/text',
    'core/textarea',
    'core/slug',
    'core/url',
    'core/email',
    'core/phone',
    'core/markdown',
    'core/color',
    'core/icon',
    'core/id',
    'core/status',
    'core/date',
    'core/time',
    'core/datetime'
]);

const PRELUDE = (input: TypegenInput) => {
    const locales = [...new Set([input.defaultLocale, ...input.locales])];
    return `// Content types of the Moteur project "${input.projectId}". Generated: do not edit.
// Make them again after a schema changes: moteur types --out <file>

/** The project's languages. */
export type Locale = ${locales.map(quote).join(' | ') || 'string'};
export type DefaultLocale = ${quote(input.defaultLocale)};

/**
 * How values in several languages come: 'all' as stored (one per language), 'one' when read
 * with \`?locale=\` (just that language, or the default one).
 */
export type LocaleMode = 'all' | 'one';

/** A value in several languages. */
export type Localized<T, M extends LocaleMode> = M extends 'one' ? T : Partial<Record<Locale, T>>;

/** Text that may be the same in every language, or one per language. */
export type MaybeLocalized<T, M extends LocaleMode> = M extends 'one' ? T : T | Localized<T, 'all'>;

/** A picture or file. With \`?resolveAssets=1\`, \`_resolved\` holds the asset itself. */
export interface AssetRef<M extends LocaleMode = 'all'> {
    assetId: string;
    alt?: MaybeLocalized<string, M>;
    caption?: MaybeLocalized<string, M>;
    _resolved?: {
        id: string;
        url?: string;
        resizeUrl?: string;
        type?: string;
        mimeType?: string;
        width?: number;
        height?: number;
        /** Where crops center, 0–1 from the top left. */
        focalPoint?: { x: number; y: number };
        [key: string]: unknown;
    };
    /** For a field that crops: the picture in that shape (add \`&w=\`). */
    cropUrl?: string;
    aspectRatio?: string;
}

/** A link: to an address, or to a page (\`pageId\`, its \`url\` filled in on delivery). */
export interface Link<M extends LocaleMode = 'all'> {
    url?: MaybeLocalized<string, M>;
    pageId?: string;
    /** The page is gone or not live: there is no \`url\`. */
    missing?: true;
    label?: MaybeLocalized<string, M>;
    ariaLabel?: MaybeLocalized<string, M>;
    [key: string]: unknown;
}

/** A page as a page relation gives it. */
export interface PageSummary<F = Record<string, unknown>, M extends LocaleMode = 'all'> {
    id: string;
    label: string;
    url: Localized<string, M> | (M extends 'one' ? never : string);
    fields?: F;
}

/** A relation to an entry: its id, or the entry itself once resolved. */
export type Ref<T> = string | { id: string; type?: string } | T;

export type Status = 'draft' | 'in_review' | 'published' | 'unpublished' | 'archived';

export interface Entry<D, Model extends string = string> {
    id: string;
    type: Model;
    status?: Status;
    data: D;
    meta?: Record<string, unknown>;
    resolvedUrl?: string;
}

export interface Page<F, Template extends string = string> {
    id: string;
    type: 'static' | 'collection';
    label: string;
    slug: string;
    slugs?: Partial<Record<Locale, string>>;
    parentId: string | null;
    order: number;
    templateId: Template;
    status: 'draft' | 'published';
    /** Its address: in the language read (\`?locale=\`), otherwise the default language's. */
    path: string;
    /** Its address in each language. */
    paths: Record<Locale, string>;
    fields: F;
    navInclude: boolean;
    navLabel?: string;
    modelId?: string;
    createdAt: string;
    updatedAt: string;
}

export interface Block<T extends string, D> {
    type: T;
    data: D;
    locales?: Locale[];
    meta?: Record<string, unknown>;
}
`;
};

/** Writes the types: one name per schema, each a generic over the locale mode. */
export function generateTypes(input: TypegenInput): string {
    const locale = input.defaultLocale;
    const used = new Set<string>([
        'Locale',
        'DefaultLocale',
        'LocaleMode',
        'Localized',
        'MaybeLocalized',
        'AssetRef',
        'Link',
        'PageSummary',
        'Ref',
        'Status',
        'Entry',
        'Page',
        'Block',
        'AnyBlock',
        'AnyPage',
        'Models',
        'Templates',
        'MoteurContent',
        'MoteurSchema'
    ]);
    const nameFor = (base: string) => {
        let name = base;
        for (let i = 2; used.has(name); i++) name = `${base}${i}`;
        used.add(name);
        return name;
    };
    /** Project blocks and structures drop their namespace; core and plugin ones keep it. */
    const short = (type: string) => {
        const [ns, rest] = type.includes('/') ? type.split('/', 2) : ['', type];
        return ns === input.projectId ? pascal(rest!) : pascal(type);
    };

    const structureNames = new Map<TypegenInput['structures'][string], string>();
    for (const s of Object.values(input.structures))
        structureNames.set(s, nameFor(`${short(s.type)}Structure`));
    const blockNames = new Map<string, string>();
    for (const type of Object.keys(input.blocks))
        blockNames.set(type, nameFor(`${short(type)}Block`));
    const modelNames = new Map<string, string>();
    for (const m of input.models) modelNames.set(m.id, nameFor(`${pascal(m.id)}Data`));
    const templateNames = new Map<string, string>();
    for (const t of input.templates) templateNames.set(t.id, nameFor(`${pascal(t.id)}Fields`));
    const entryName = (modelId: string) => `${modelNames.get(modelId)!.replace(/Data$/, '')}Entry`;

    /** A field's type, written for indentation `indent`. */
    function typeOf(f: Field, indent: string): string {
        const t = f.type;
        const ml = (inner: string) => (multilingual(f) ? `Localized<${inner}, M>` : inner);
        if (STRING_TYPES.has(t)) return ml('string');
        if (t === 'core/number' || t === 'core/order') return ml('number');
        if (t === 'core/boolean') return ml('boolean');
        if (t === 'core/select') {
            const choices = choicesOf(f);
            const one = choices.length ? choices.map(quote).join(' | ') : 'string';
            return f.options?.multiple ? `Array<${one}>` : one;
        }
        if (t === 'core/multi-select' || t === 'core/tags' || t === 'core/categories') {
            const choices = choicesOf(f);
            return `Array<${choices.length ? choices.map(quote).join(' | ') : 'string'}>`;
        }
        if (t === 'core/rich-text') return `{ dast: ${ml('unknown')} }`;
        if (t === 'core/html') return `{ html: ${ml('string')} }`;
        if (t === 'core/asset' || t === 'core/image' || t === 'core/audio' || t === 'core/video')
            return t === 'core/video'
                ? 'AssetRef<M> | { provider: string; target: string; title?: string }'
                : 'AssetRef<M>';
        if (t === 'core/asset-list') return 'AssetRef<M>[]';
        if (t === 'core/link') return 'Link<M>';
        if ((t === 'core/relation' || t === 'core/relations') && f.options?.target === 'pages') {
            const summary = `PageSummary<${pickedPageFields(f, indent)}, M>`;
            return t === 'core/relations' ? `${summary}[]` : `${summary} | null`;
        }
        if (t === 'core/relation' || t === 'core/relations') {
            const model = f.options?.model;
            const target =
                typeof model === 'string' && modelNames.has(model)
                    ? `Ref<${entryName(model)}<M>>`
                    : 'Ref<Entry<Record<string, unknown>>>';
            return t === 'core/relations' ? `Array<${target}>` : target;
        }
        if (t === 'core/object') {
            const fields = childFieldsOf(f);
            return fields ? objectOf(fields, indent) : 'Record<string, unknown>';
        }
        if (t === 'core/structure') {
            const id = f.options?.structure;
            const s =
                typeof id === 'string'
                    ? findStructure(input.structures as Record<string, StructureSchema>, id)
                    : undefined;
            if (s) return `${structureNames.get(s)}<M>`;
            const inline = f.options?.inlineSchema?.fields as Fields | undefined;
            return inline ? objectOf(inline, indent) : 'Record<string, unknown>';
        }
        if (t === 'core/variant') {
            const variants = (f.options?.variants ?? {}) as Record<string, { fields?: Fields }>;
            const kinds = Object.entries(variants);
            if (!kinds.length) return '{ kind: string }';
            return kinds
                .map(([kind, v]) =>
                    objectOf({ ...(v.fields ?? {}) }, indent, `kind: ${quote(kind)}`)
                )
                .join(' | ');
        }
        if (t === 'core/list') {
            const item = (f.options?.items ?? (f as Field & { items?: Field }).items) as
                Field | undefined;
            return `Array<${item ? typeOf(item, indent) : 'unknown'}>`;
        }
        if (t === 'core/block-list') {
            const allowed = (f.options?.allowedBlockTypes as string[] | undefined)?.filter(b =>
                blockNames.has(b)
            );
            return allowed?.length
                ? `Array<${allowed.map(b => `${blockNames.get(b)}<M>`).join(' | ')}>`
                : 'Array<AnyBlock<M>>';
        }
        if (t === 'core/table') return '{ value: { columnTitles: string[]; rows: string[][] } }';
        if (t === 'core/address')
            return '{ street?: string; city?: string; state?: string; postalCode?: string; country?: string }';
        return 'unknown';
    }

    /** The fields a page relation asks for, typed from every template that has them. */
    function pickedPageFields(f: Field, indent: string): string {
        const picked = Array.isArray(f.options?.fields) ? (f.options.fields as string[]) : [];
        if (!picked.length) return 'Record<string, unknown>';
        const parts = picked.map(k => {
            const types = new Set<string>();
            for (const t of input.templates) {
                const sub = (t.fields as Fields | undefined)?.[k];
                if (sub) types.add(typeOf(sub, `${indent}    `));
            }
            return `${indent}    ${key(k)}?: ${types.size ? [...types].join(' | ') : 'unknown'};`;
        });
        return `{\n${parts.join('\n')}\n${indent}}`;
    }

    function objectOf(fields: Fields, indent: string, first?: string): string {
        const inner = `${indent}    `;
        const lines = first ? [`${inner}${first};`] : [];
        for (const [k, f] of Object.entries(fields)) {
            if (first && k === 'kind') continue;
            const text = textOf(f.description, locale) || textOf(f.label, locale);
            // A label that only repeats the key says nothing.
            const label =
                text.replace(/[^a-z0-9]/gi, '').toLowerCase() ===
                k.replace(/[^a-z0-9]/gi, '').toLowerCase()
                    ? ''
                    : text;
            lines.push(
                `${doc(label, inner)}${inner}${key(k)}${required(f) ? '' : '?'}: ${typeOf(f, inner)};`
            );
        }
        return lines.length ? `{\n${lines.join('\n')}\n${indent}}` : '{}';
    }

    const out: string[] = [PRELUDE(input)];
    const iface = (name: string, label: string, fields: unknown) => {
        const body = objectOf((fields as Fields | undefined) ?? {}, '');
        // Every type takes the mode; one whose fields don't depend on it says so (no unused-parameter hint).
        const mode = /\bM\b/.test(body) ? 'M' : '_M';
        return `${doc(label, '')}export interface ${name}<${mode} extends LocaleMode = 'all'> ${body}\n`;
    };

    if (structureNames.size) out.push('// Structures\n');
    for (const [s, name] of structureNames)
        out.push(iface(name, textOf(s.label, locale) || s.type, s.fields));

    out.push('// Blocks\n');
    for (const [type, name] of blockNames) {
        const b = input.blocks[type]!;
        out.push(iface(`${name}Data`, textOf(b.label, locale) || type, b.fields));
        out.push(
            `export type ${name}<M extends LocaleMode = 'all'> = Block<${quote(type)}, ${name}Data<M>>;\n`
        );
    }
    out.push(
        `/** Any block of the project. */\nexport type AnyBlock<M extends LocaleMode = 'all'> = ${
            [...blockNames.values()].map(n => `${n}<M>`).join(' | ') ||
            'Block<string, Record<string, unknown>>'
        };\n`
    );

    out.push('// Models\n');
    for (const m of input.models) {
        const name = modelNames.get(m.id)!;
        out.push(iface(name, textOf(m.label, locale) || m.id, m.fields));
        out.push(
            `export type ${entryName(m.id)}<M extends LocaleMode = 'all'> = Entry<${name}<M>, ${quote(m.id)}>;\n`
        );
    }
    out.push(
        `/** Each model's entries, by model id. */\nexport interface Models<M extends LocaleMode = 'all'> {\n${input.models
            .map(m => `    ${key(m.id)}: ${entryName(m.id)}<M>;`)
            .join('\n')}\n}\n`
    );

    out.push('// Templates (pages)\n');
    for (const t of input.templates) {
        const name = templateNames.get(t.id)!;
        out.push(iface(name, textOf(t.label, locale) || t.id, t.fields));
        out.push(
            `export type ${name.replace(/Fields$/, '')}Page<M extends LocaleMode = 'all'> = Page<${name}<M>, ${quote(t.id)}>;\n`
        );
    }
    out.push(
        `/** Each template's pages, by template id. */\nexport interface Templates<M extends LocaleMode = 'all'> {\n${input.templates
            .map(
                t => `    ${key(t.id)}: ${templateNames.get(t.id)!.replace(/Fields$/, '')}Page<M>;`
            )
            .join('\n')}\n}\n`
    );
    out.push(
        input.templates.length
            ? `/** Any page of the project, told apart by \`templateId\`. */\nexport type AnyPage<M extends LocaleMode = 'all'> = Templates<M>[keyof Templates<M>];\n`
            : `/** Any page of the project (it has no templates yet). */\nexport type AnyPage<M extends LocaleMode = 'all'> = Page<Record<string, unknown>>;\n`
    );
    out.push(`// For the client

/** What the project delivers, in a locale mode. */
export interface MoteurContent<M extends LocaleMode = 'all'> {
    models: Models<M>;
    pages: AnyPage<M>;
    blocks: AnyBlock<M>;
}

/**
 * The project, for a typed client: answers come typed, in one language after \`locale()\`.
 *
 *     const moteur = createMoteurPublicClient<MoteurSchema>({ … });
 *     const pages = await moteur.locale('fr').channel('site').pages.list();
 */
export interface MoteurSchema {
    locale: Locale;
    /** The project's own blocks are \`\${namespace}/…\`: \`defineBlocks\` names them without it. */
    namespace: ${quote(input.projectId)};
    all: MoteurContent<'all'>;
    one: MoteurContent<'one'>;
}
`);
    return out.join('\n');
}

/** The types of a project, from its schemas as they are now (for someone who can read them). */
export async function projectTypes(user: User, projectId: string): Promise<string> {
    const project = await getProjectById(projectId);
    return generateTypes({
        projectId,
        defaultLocale: project?.defaultLocale || 'en',
        locales: project?.supportedLocales ?? [],
        models: await listModelSchemas(user, projectId),
        templates: await listTemplates(projectId),
        blocks: listBlocks(projectId),
        structures: await listStructures(projectId)
    });
}
