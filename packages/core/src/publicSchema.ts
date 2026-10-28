/**
 * A channel's schema, for whoever reads the channel: what its models, pages, blocks and
 * structures hold, without Studio's presentation or plugins' settings. `/types` and a site's
 * generated types are made from it, so a read-only key is enough for both.
 */
import { createHash } from 'crypto';
import type { Field } from '@moteurio/types/Field.js';
import type { ModelSchema } from '@moteurio/types/Model.js';
import type { BlockSchema } from '@moteurio/types/Block.js';
import type { StructureSchema } from '@moteurio/types/Structure.js';
import type { TemplateSchema } from '@moteurio/types/Template.js';
import type {
    Localizable,
    PublicField,
    PublicSchema,
    PublicStructure
} from '@moteurio/types/PublicSchema.js';
import { getChannel } from './channels.js';
import { getModelSchemaForProject } from './models.js';
import { listTemplates } from './templates.js';
import { listBlocks } from './blocks.js';
import { findStructure, listStructures } from './structures.js';
import { getProjectById } from './projects.js';
import { generateTypes } from './typegen.js';
import { childFieldsOf } from './fieldWalk.js';
import { listProjectKeys } from './utils/projectStorage.js';
import { modelListPrefix } from './utils/storageKeys.js';

type Fields = Record<string, Field>;

/**
 * Options that explain a value. Anything else (Studio's `ui`, `placeholder`, `labelField`,
 * plugins' settings) stays private, so a new option is never public by accident.
 */
const PUBLIC_OPTIONS = new Set([
    'required',
    'multilingual',
    'default',
    'allowEmpty',
    // choices
    'choices',
    'values',
    'multiple',
    'trueLabel',
    'falseLabel',
    // what it points at
    'target',
    'model',
    'fields',
    'structure',
    'allowedBlockTypes',
    'relativeOnly',
    // limits
    'min',
    'max',
    'step',
    'minLength',
    'maxLength',
    'minItems',
    'maxItems',
    'uniqueItems',
    'minBlocks',
    'maxBlocks',
    'maxTags',
    'minRows',
    'maxRows',
    'minCols',
    'maxCols',
    // shape of the value
    'format',
    'allowedTags',
    'aspectRatio',
    'focalPoint',
    'decorative',
    'sourceField'
]);

const textOf = (v: unknown): Localizable | undefined =>
    typeof v === 'string' || (v && typeof v === 'object') ? (v as Localizable) : undefined;

/** A schema's fields, without what isn't public. */
export function publicFields(fields: Fields | undefined): Record<string, PublicField> {
    const out: Record<string, PublicField> = {};
    for (const [k, f] of Object.entries(fields ?? {})) {
        if (f && typeof f === 'object' && typeof f.type === 'string') out[k] = publicField(f);
    }
    return out;
}

/** A field, without what isn't public: see `PUBLIC_OPTIONS`. */
export function publicField(f: Field): PublicField {
    const out: PublicField = { type: f.type };
    const label = textOf(f.label);
    const description = textOf(f.description);
    if (label) out.label = label;
    if (description) out.description = description;

    const options: Record<string, unknown> = {};
    if (f.required === true) options.required = true;
    for (const [k, v] of Object.entries(f.options ?? {})) {
        if (PUBLIC_OPTIONS.has(k) && v !== undefined) options[k] = v;
    }
    // Options holding fields of their own: cleaned the same way.
    const o = f.options ?? {};
    if (o.items && typeof o.items === 'object') options.items = publicField(o.items as Field);
    else if (f.items && typeof f.items === 'object') options.items = publicField(f.items as Field);
    if (o.inlineSchema && typeof o.inlineSchema === 'object') {
        options.inlineSchema = {
            fields: publicFields((o.inlineSchema as { fields?: Fields }).fields)
        };
    }
    if (o.variants && typeof o.variants === 'object') {
        const variants: Record<
            string,
            { label?: Localizable; fields: Record<string, PublicField> }
        > = {};
        for (const [kind, v] of Object.entries(
            o.variants as Record<string, Record<string, unknown>>
        )) {
            const vl = textOf(v?.label);
            variants[kind] = {
                ...(vl && { label: vl }),
                fields: publicFields(v?.fields as Fields | undefined)
            };
        }
        options.variants = variants;
    }
    if (Object.keys(options).length) out.options = options;

    const children = childFieldsOf(f);
    if (children) out.fields = publicFields(children);
    return out;
}

/** Every field below these, at any depth (for finding what they use). */
function* walk(fields: Record<string, PublicField>): Generator<PublicField> {
    for (const f of Object.values(fields)) {
        yield f;
        if (f.fields) yield* walk(f.fields);
        const o = f.options ?? {};
        if (o.items) yield* walk({ items: o.items as PublicField });
        const inline = o.inlineSchema as { fields?: Record<string, PublicField> } | undefined;
        if (inline?.fields) yield* walk(inline.fields);
        for (const v of Object.values(
            (o.variants ?? {}) as Record<string, { fields?: Record<string, PublicField> }>
        )) {
            if (v.fields) yield* walk(v.fields);
        }
    }
}

async function allModels(projectId: string): Promise<ModelSchema[]> {
    const out: ModelSchema[] = [];
    for (const id of await listProjectKeys(projectId, modelListPrefix())) {
        const schema = await getModelSchemaForProject(projectId, id);
        if (schema) out.push(schema);
    }
    return out;
}

/** The schema of what a channel delivers, or null when there's no such channel. */
export async function channelSchema(
    projectId: string,
    channelId: string
): Promise<PublicSchema | null> {
    const channel = await getChannel(projectId, channelId);
    if (!channel) return null;
    const project = await getProjectById(projectId);
    const defaultLocale = project?.defaultLocale || 'en';

    // Models, with only the fields the channel gives.
    const models: PublicSchema['models'] = {};
    let everyModel: ModelSchema[] | undefined;
    for (const r of channel.resources) {
        if (r.resourceType !== 'model') continue;
        const schemas =
            r.resourceId === 'models'
                ? (everyModel ??= await allModels(projectId))
                : [await getModelSchemaForProject(projectId, r.resourceId)].filter(
                      (m): m is ModelSchema => !!m
                  );
        for (const m of schemas) {
            if (models[m.id]) continue;
            const only = r.fields?.length ? new Set(r.fields) : undefined;
            const fields = Object.fromEntries(
                Object.entries(m.fields ?? {}).filter(([k]) => !only || only.has(k))
            );
            models[m.id] = {
                id: m.id,
                label: m.label,
                ...(m.description && { description: m.description }),
                ...(m.modelType && { modelType: m.modelType }),
                ...(m.urlPattern && { urlPattern: m.urlPattern }),
                fields: publicFields(fields)
            };
        }
    }

    // Templates of the pages it gives: every one, or those named.
    const templates: PublicSchema['templates'] = {};
    const pageResources = channel.resources.filter(r => r.resourceType === 'page');
    if (pageResources.length) {
        const every = pageResources.some(r => r.resourceId === 'pages');
        const named = new Set(pageResources.map(r => r.resourceId));
        for (const t of (await listTemplates(projectId)) as TemplateSchema[]) {
            if (!every && !named.has(t.id)) continue;
            templates[t.id] = {
                id: t.id,
                label: t.label,
                ...(t.description && { description: t.description }),
                fields: publicFields(t.fields)
            };
        }
    }

    // The blocks and structures those use, and those they use in turn. Editorial blocks are
    // Studio's only: delivery strips them, so they aren't described.
    const blockRegistry: Record<string, BlockSchema> = listBlocks(projectId);
    const structureRegistry: Record<string, StructureSchema> = await listStructures(projectId);
    const publicBlocks = Object.values(blockRegistry).filter(b => !b.editorial);
    const blocks: PublicSchema['blocks'] = {};
    const structures: PublicSchema['structures'] = {};
    const queue: Record<string, PublicField>[] = [
        ...Object.values(models).map(m => m.fields),
        ...Object.values(templates).map(t => t.fields)
    ];
    while (queue.length) {
        for (const f of walk(queue.shift()!)) {
            const o = f.options ?? {};
            if (f.type === 'core/structure' && typeof o.structure === 'string') {
                const s = findStructure(structureRegistry, o.structure);
                if (s && !structures[s.type]) {
                    const entry: PublicStructure = {
                        type: s.type,
                        label: s.label,
                        ...(s.description && { description: s.description }),
                        fields: publicFields(s.fields)
                    };
                    structures[s.type] = entry;
                    queue.push(entry.fields);
                }
            }
            if (f.type === 'core/block-list') {
                const allowed = Array.isArray(o.allowedBlockTypes)
                    ? (o.allowedBlockTypes as string[])
                    : [];
                const used = allowed.length
                    ? publicBlocks.filter(b => allowed.includes(b.type))
                    : publicBlocks;
                if (allowed.length) {
                    o.allowedBlockTypes = allowed.filter(t => !blockRegistry[t]?.editorial);
                }
                for (const b of used) {
                    if (blocks[b.type]) continue;
                    blocks[b.type] = {
                        type: b.type,
                        label: b.label,
                        ...(b.description && { description: b.description }),
                        ...(b.category && { category: b.category }),
                        ...(b.variantHints?.length && { variantHints: b.variantHints }),
                        fields: publicFields(b.fields)
                    };
                    queue.push(blocks[b.type]!.fields);
                }
            }
        }
    }

    const sorted = <T>(r: Record<string, T>) =>
        Object.fromEntries(Object.entries(r).sort(([a], [b]) => a.localeCompare(b)));
    const body = {
        projectId,
        channelId,
        defaultLocale,
        locales: [...new Set([defaultLocale, ...(project?.supportedLocales ?? [])])],
        models: sorted(models),
        templates: sorted(templates),
        blocks: sorted(blocks),
        structures: sorted(structures)
    };
    const version = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16);
    return { version, ...body };
}

/** A channel's content as TypeScript types, from its public schema (what a site's key may read). */
export function schemaTypes(schema: PublicSchema): string {
    return generateTypes({
        projectId: schema.projectId,
        defaultLocale: schema.defaultLocale,
        locales: schema.locales,
        channelId: schema.channelId,
        models: Object.values(schema.models),
        templates: Object.values(schema.templates),
        blocks: schema.blocks,
        structures: schema.structures
    });
}
