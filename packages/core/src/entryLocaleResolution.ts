import type { Block } from '@moteurio/types/Block.js';
import type { BlockSchema } from '@moteurio/types/Block.js';
import type { Field } from '@moteurio/types/Field.js';
import type { Entry } from '@moteurio/types/Model.js';
import type { ModelSchema } from '@moteurio/types/Model.js';
import { getModelSchemaForProject } from './models.js';
import { listStructures } from './structures.js';
import { walkFields, type FieldWalkSchemas } from './fieldWalk.js';
import { isLikelyLocaleStringMap, isPlainObject } from './validators/fieldValueUtils.js';

function pickFromLocaleMap(
    map: Record<string, unknown>,
    locale: string,
    fallbackLocale: string
): unknown {
    if (map[locale] != null) return map[locale];
    if (fallbackLocale && map[fallbackLocale] != null) return map[fallbackLocale];
    const first = Object.values(map).find(v => v != null);
    return first;
}

/**
 * Resolve one field value to a single locale (multilingual fields only), preserving field keys on the parent object.
 */
export function resolveFieldValueForLocale(
    field: Field,
    value: unknown,
    locale: string,
    fallbackLocale: string,
    projectId: string,
    blockRegistry: Record<string, BlockSchema>
): unknown {
    if (value == null) return value;

    const mult = field.options?.multilingual === true;
    const t = field.type;

    if (t === 'core/layout' && Array.isArray(value)) {
        return resolveBlocksForLocale(
            value as Block[],
            locale,
            fallbackLocale,
            projectId,
            blockRegistry
        );
    }

    if (!mult) {
        if (t === 'core/layout' && Array.isArray(value)) {
            return resolveBlocksForLocale(
                value as Block[],
                locale,
                fallbackLocale,
                projectId,
                blockRegistry
            );
        }
        return value;
    }

    if (t === 'core/rich-text') {
        if (isPlainObject(value) && 'dast' in value) {
            const dast = (value as { dast: unknown }).dast;
            if (
                isPlainObject(dast) &&
                !Array.isArray(dast) &&
                !('type' in dast) &&
                Object.keys(dast).length > 0
            ) {
                const resolved = pickFromLocaleMap(
                    dast as Record<string, unknown>,
                    locale,
                    fallbackLocale
                );
                if (resolved !== undefined) return { dast: resolved };
            }
        }
        return value;
    }

    if (t === 'core/html') {
        const html = isPlainObject(value) ? (value as { html?: unknown }).html : undefined;
        if (isPlainObject(html) && !Array.isArray(html)) {
            const resolved = pickFromLocaleMap(
                html as Record<string, unknown>,
                locale,
                fallbackLocale
            );
            if (resolved !== undefined) return { html: resolved };
        }
        return value;
    }

    if (t === 'core/link' && isPlainObject(value)) {
        const o = { ...(value as Record<string, unknown>) };
        for (const k of ['url', 'label'] as const) {
            const v = o[k];
            if (v != null && isPlainObject(v) && isLikelyLocaleStringMap(v)) {
                const picked = pickFromLocaleMap(
                    v as Record<string, unknown>,
                    locale,
                    fallbackLocale
                );
                o[k] = picked ?? '';
            }
        }
        return o;
    }

    if (isLikelyLocaleStringMap(value)) {
        const picked = pickFromLocaleMap(value as Record<string, unknown>, locale, fallbackLocale);
        return picked ?? '';
    }

    return value;
}

function resolveBlocksForLocale(
    blocks: Block[],
    locale: string,
    fallbackLocale: string,
    projectId: string,
    blockRegistry: Record<string, BlockSchema>
): Block[] {
    return blocks.map(block => {
        const schema = blockRegistry[block.type];
        if (!schema?.fields) return block;
        const data: Record<string, unknown> = { ...block.data };
        for (const [key, f] of Object.entries(schema.fields)) {
            if (data[key] === undefined) continue;
            data[key] = resolveFieldValueForLocale(
                f,
                data[key],
                locale,
                fallbackLocale,
                projectId,
                blockRegistry
            );
        }
        return { ...block, data };
    });
}

/**
 * Returns a shallow copy of the entry with `data` fields resolved to the requested locale (multilingual only).
 */
export function resolveEntryDataForLocale(
    entry: Entry,
    modelSchema: ModelSchema,
    locale: string,
    fallbackLocale: string,
    projectId: string,
    blockRegistry: Record<string, BlockSchema>
): Entry {
    if (!entry.data || !modelSchema.fields) return entry;

    const data: Record<string, unknown> = { ...entry.data };
    for (const [key, field] of Object.entries(modelSchema.fields)) {
        if (data[key] === undefined) continue;
        data[key] = resolveFieldValueForLocale(
            field,
            data[key],
            locale,
            fallbackLocale,
            projectId,
            blockRegistry
        );
    }
    return { ...entry, data };
}

function isNestedEntryLike(v: unknown): v is Entry {
    return (
        isPlainObject(v) &&
        typeof (v as { id?: unknown }).id === 'string' &&
        typeof (v as { type?: unknown }).type === 'string' &&
        isPlainObject((v as { data?: unknown }).data)
    );
}

/** The language a reader asked for, and the one to fall back to (the project's default). */
export type LocaleChoice = { locale: string; fallback: string };

/**
 * What a deep locale pass reads: the blocks and structures to walk into, and each model's schema
 * for the entries reference resolution inlined.
 */
export type LocaleSchemas = FieldWalkSchemas & {
    model?: (modelId: string) => Promise<ModelSchema | null>;
};

const RELATION_TYPES = ['core/relation', 'core/relations'];
const ASSET_TYPES = ['core/asset', 'core/image', 'core/audio', 'core/video', 'core/asset-list'];

/** A picture's alt and caption, which may be one per language whatever the field's options. */
function localizeAssetTexts(value: unknown, choice: LocaleChoice): unknown {
    if (Array.isArray(value)) return value.map(v => localizeAssetTexts(v, choice));
    if (!isPlainObject(value) || typeof value.assetId !== 'string') return value;
    const out: Record<string, unknown> = { ...value };
    for (const key of ['alt', 'caption']) {
        if (isPlainObject(out[key]))
            out[key] =
                pickFromLocaleMap(
                    out[key] as Record<string, unknown>,
                    choice.locale,
                    choice.fallback
                ) ?? '';
    }
    return out;
}

/**
 * Every multilingual value of a record down to one language, at any depth: in blocks, lists,
 * objects, structures and variants, and in the entries its relations inlined (`depth` levels).
 * A link's url and label, and a picture's alt and caption, always come down to one language when
 * they are given per language.
 */
export async function localizeFields(
    values: Record<string, unknown> | undefined,
    fields: Record<string, Field> | undefined,
    schemas: LocaleSchemas,
    choice: LocaleChoice,
    depth = 2
): Promise<Record<string, unknown> | undefined> {
    const pick = (field: Field, value: unknown) =>
        resolveFieldValueForLocale(
            field,
            value,
            choice.locale,
            choice.fallback,
            '',
            schemas.blocks
        );
    return walkFields(values, fields, schemas, async (value, field) => {
        if (field.type === 'core/link')
            return pick({ ...field, options: { ...field.options, multilingual: true } }, value);
        if (ASSET_TYPES.includes(field.type)) return localizeAssetTexts(value, choice);
        if (field.options?.multilingual === true || field.type === 'core/layout') {
            const picked = pick(field, value);
            return picked === value ? undefined : picked;
        }
        // Page relations come down to one language when their links are filled in (pageLinks).
        if (RELATION_TYPES.includes(field.type)) {
            if (field.options?.target === 'pages') return value;
            const inner = (item: unknown) =>
                isNestedEntryLike(item) ? localizeEntry(item, schemas, choice, depth - 1) : item;
            return Array.isArray(value) ? Promise.all(value.map(inner)) : inner(value);
        }
        return undefined;
    });
}

/** An entry's data down to one language, by its model's schema (see localizeFields). */
export async function localizeEntry(
    entry: Entry,
    schemas: LocaleSchemas,
    choice: LocaleChoice,
    depth = 2
): Promise<Entry> {
    if (depth <= 0 || !schemas.model) return entry;
    const schema = await schemas.model(entry.type);
    if (!schema) return entry;
    const data = await localizeFields(entry.data, schema.fields, schemas, choice, depth);
    return { ...entry, data: data ?? entry.data };
}

/** The blocks, structures and model schemas of a project, for localizeFields. */
export async function localeSchemas(
    projectId: string,
    blockRegistry: Record<string, BlockSchema>
): Promise<LocaleSchemas> {
    const models = new Map<string, Promise<ModelSchema | null>>();
    return {
        blocks: blockRegistry,
        structures: await listStructures(projectId),
        model: id => {
            let found = models.get(id);
            if (!found) {
                found = getModelSchemaForProject(projectId, id).catch(() => null);
                models.set(id, found);
            }
            return found;
        }
    };
}

/**
 * Resolves locales on the entry and on inlined reference entries (same shape as `resolveEntryReferences` output),
 * at any depth of its fields.
 */
export async function resolveEntryDataForLocaleDeep(
    entry: Entry,
    projectId: string,
    locale: string,
    fallbackLocale: string,
    blockRegistry: Record<string, BlockSchema>,
    depth = 2
): Promise<Entry> {
    return localizeEntry(
        entry,
        await localeSchemas(projectId, blockRegistry),
        { locale, fallback: fallbackLocale },
        depth
    );
}
