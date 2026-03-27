import type { Block } from '@moteurio/types/Block.js';
import type { BlockSchema } from '@moteurio/types/Block.js';
import type { Field } from '@moteurio/types/Field.js';
import type { Entry } from '@moteurio/types/Model.js';
import type { ModelSchema } from '@moteurio/types/Model.js';
import { getModelSchemaForProject } from './models.js';
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

/**
 * Resolves locales on the entry and on inlined reference entries (same shape as `resolveEntryReferences` output).
 */
export async function resolveEntryDataForLocaleDeep(
    entry: Entry,
    projectId: string,
    locale: string,
    fallbackLocale: string,
    blockRegistry: Record<string, BlockSchema>,
    depth = 2
): Promise<Entry> {
    if (depth <= 0) return entry;
    const schema = await getModelSchemaForProject(projectId, entry.type);
    if (!schema) return entry;
    let e = resolveEntryDataForLocale(
        entry,
        schema,
        locale,
        fallbackLocale,
        projectId,
        blockRegistry
    );
    if (!e.data) return e;
    const data: Record<string, unknown> = { ...e.data };
    for (const [key, val] of Object.entries(data)) {
        if (isNestedEntryLike(val)) {
            data[key] = await resolveEntryDataForLocaleDeep(
                val,
                projectId,
                locale,
                fallbackLocale,
                blockRegistry,
                depth - 1
            );
        } else if (Array.isArray(val)) {
            data[key] = await Promise.all(
                val.map(async item =>
                    isNestedEntryLike(item)
                        ? resolveEntryDataForLocaleDeep(
                              item,
                              projectId,
                              locale,
                              fallbackLocale,
                              blockRegistry,
                              depth - 1
                          )
                        : item
                )
            );
        }
    }
    return { ...e, data };
}
