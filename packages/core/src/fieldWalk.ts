import type { Field } from '@moteurio/types/Field.js';
import type { BlockSchema } from '@moteurio/types/Block.js';
import type { StructureSchema } from '@moteurio/types/Structure.js';
import { listBlocks } from './blocks.js';
import { findStructure, listStructures } from './structures.js';
import { isPlainObject } from './validators/fieldValueUtils.js';
import { variantsOf } from './validators/fields/core/validateVariantField.js';

/** The block and structure schemas of one project, read once for a whole walk. */
export type FieldWalkSchemas = {
    blocks: Record<string, BlockSchema>;
    structures: Record<string, StructureSchema>;
};

export async function fieldWalkSchemas(projectId: string): Promise<FieldWalkSchemas> {
    return { blocks: listBlocks(projectId), structures: await listStructures(projectId) };
}

/**
 * Called on every field reached, outermost first. Return a replacement value to stop there, or
 * `undefined` to keep the value and walk into it.
 */
export type FieldVisitor = (
    value: unknown,
    field: Field,
    path: string
) => unknown | Promise<unknown>;

type Fields = Record<string, Field>;

/** The fields of an object field, wherever the schema keeps them. */
export const childFieldsOf = (field: Field): Fields | undefined =>
    (field.data as Fields | undefined) ??
    ((field as Field & { fields?: Fields }).fields as Fields | undefined) ??
    ((field as Field & { properties?: Fields }).properties as Fields | undefined);

/** The fields a structure field holds: its shared structure's, or its inline schema's. */
function structureFields(field: Field, schemas: FieldWalkSchemas): Fields | undefined {
    const id = field.options?.structure;
    if (typeof id === 'string')
        return findStructure(schemas.structures, id)?.fields as Fields | undefined;
    return field.options?.inlineSchema?.fields as Fields | undefined;
}

/** A structure or object value may be stored flat or under `content` or `value`. */
function unwrap(value: Record<string, unknown>, own: Fields): [string | null, unknown] {
    for (const key of ['content', 'value'])
        if (key in value && !(key in own) && isPlainObject(value[key])) return [key, value[key]];
    return [null, value];
}

async function walkObject(
    value: unknown,
    fields: Fields,
    path: string,
    schemas: FieldWalkSchemas,
    visit: FieldVisitor,
    keep: readonly string[] = []
): Promise<unknown> {
    if (!isPlainObject(value)) return value;
    const [wrapper, inner] = unwrap(value as Record<string, unknown>, fields);
    const source = inner as Record<string, unknown>;
    const out: Record<string, unknown> = { ...source };
    for (const [key, sub] of Object.entries(fields)) {
        if (keep.includes(key) || !(key in source)) continue;
        out[key] = await walkField(source[key], sub, path ? `${path}.${key}` : key, schemas, visit);
    }
    return wrapper ? { ...(value as object), [wrapper]: out } : out;
}

/** Walk one field's value: visit it, then go into lists, objects, structures, variants and blocks. */
export async function walkField(
    value: unknown,
    field: Field,
    path: string,
    schemas: FieldWalkSchemas,
    visit: FieldVisitor
): Promise<unknown> {
    if (value === undefined || value === null) return value;
    const replaced = await visit(value, field, path);
    if (replaced !== undefined) return replaced;

    switch (field.type) {
        case 'core/object': {
            const fields = childFieldsOf(field);
            return fields ? walkObject(value, fields, path, schemas, visit) : value;
        }
        case 'core/structure': {
            const fields = structureFields(field, schemas);
            return fields ? walkObject(value, fields, path, schemas, visit) : value;
        }
        case 'core/variant': {
            const kind = isPlainObject(value) ? (value as { kind?: unknown }).kind : undefined;
            const fields = typeof kind === 'string' ? variantsOf(field)?.[kind]?.fields : undefined;
            return fields ? walkObject(value, fields, path, schemas, visit, ['kind']) : value;
        }
        case 'core/list': {
            const item = (field.options?.items ?? (field as Field & { items?: Field }).items) as
                Field | undefined;
            if (!item) return value;
            const wrapped =
                isPlainObject(value) && Array.isArray((value as { items?: unknown }).items);
            const items = wrapped ? (value as { items: unknown[] }).items : value;
            if (!Array.isArray(items)) return value;
            const out = [];
            for (let i = 0; i < items.length; i++)
                out.push(await walkField(items[i], item, `${path}[${i}]`, schemas, visit));
            return wrapped ? { ...(value as object), items: out } : out;
        }
        case 'core/block-list': {
            if (!Array.isArray(value)) return value;
            const out = [];
            for (let i = 0; i < value.length; i++) {
                const block = value[i] as { type?: unknown; data?: unknown } | null;
                const schema =
                    block && typeof block.type === 'string'
                        ? schemas.blocks[block.type]
                        : undefined;
                if (!schema?.fields || !isPlainObject(block?.data)) {
                    out.push(block);
                    continue;
                }
                out.push({
                    ...block,
                    data: await walkObject(
                        block!.data,
                        schema.fields as Fields,
                        `${path}[${i}].data`,
                        schemas,
                        visit
                    )
                });
            }
            return out;
        }
        default:
            return value;
    }
}

/** Walk every field of a record (an entry's data, a page's fields) against its schema. */
export async function walkFields(
    values: Record<string, unknown> | undefined,
    fields: Fields | undefined,
    schemas: FieldWalkSchemas,
    visit: FieldVisitor
): Promise<Record<string, unknown> | undefined> {
    if (!values || !fields) return values;
    const out: Record<string, unknown> = { ...values };
    for (const [key, field] of Object.entries(fields))
        if (key in values) out[key] = await walkField(values[key], field, key, schemas, visit);
    return out;
}
