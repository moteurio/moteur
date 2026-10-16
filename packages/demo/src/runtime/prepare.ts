import type { Field } from '@moteurio/types/Field.js';
import type { BlockSchema } from '@moteurio/types/Block.js';
import { dast } from './dast.js';

/**
 * Convert values written in the demo sources to their stored form, guided by each field's
 * type:
 * - rich text written as markup strings becomes DAST;
 * - `{ art: 'key' }` becomes the uploaded asset (an image `src`, an `assetId`, …);
 * - blocks, lists and objects are converted recursively with their own schemas.
 * Values already in stored form pass through unchanged.
 */

export type ArtRef = { art: string; alt?: unknown; caption?: unknown; credit?: unknown };

export type UploadedArt = {
    assetId: string;
    url: string;
    alt: Record<string, string>;
    credit?: string;
};

export type PrepareContext = {
    blocks: Record<string, BlockSchema>;
    art: (key: string) => UploadedArt;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isArtRef(v: unknown): v is ArtRef {
    return isPlainObject(v) && typeof v.art === 'string';
}

function opt<T = unknown>(field: Field, key: string): T | undefined {
    const f = field as Field & Record<string, unknown>;
    return (
        ((f.options as Record<string, unknown> | undefined)?.[key] as T | undefined) ??
        (f[key] as T | undefined)
    );
}

function richText(value: unknown): unknown {
    if (typeof value === 'string') return dast(value);
    if (isPlainObject(value) && !('schema' in value) && !('dast' in value)) {
        const out: Record<string, unknown> = {};
        for (const [locale, v] of Object.entries(value)) {
            out[locale] = typeof v === 'string' ? dast(v) : v;
        }
        return { dast: out };
    }
    return value;
}

function itemField(field: Field): Field | undefined {
    return (opt<Field>(field, 'items') ?? (field as Field & { subItems?: Field }).subItems) as
        Field | undefined;
}

function objectFields(field: Field): Record<string, Field> | undefined {
    const f = field as Field & {
        fields?: Record<string, Field>;
        properties?: Record<string, Field>;
    };
    return f.fields ?? f.properties ?? opt<Record<string, Field>>(field, 'fields');
}

export function prepareFields(
    fields: Record<string, Field> | undefined,
    data: Record<string, unknown>,
    ctx: PrepareContext
): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
        const field = fields?.[key];
        out[key] = field ? prepareValue(field, value, ctx) : value;
    }
    return out;
}

export function prepareValue(field: Field, value: unknown, ctx: PrepareContext): unknown {
    if (value === undefined || value === null) return value;
    switch (field.type) {
        case 'core/rich-text':
            return richText(value);
        case 'core/image':
            if (isArtRef(value)) {
                const a = ctx.art(value.art);
                return {
                    src: a.url,
                    alt: value.alt ?? a.alt,
                    ...(value.caption !== undefined && { caption: value.caption }),
                    ...((value.credit ?? a.credit) !== undefined && {
                        credit: value.credit ?? a.credit
                    })
                };
            }
            return value;
        case 'core/asset':
            if (isArtRef(value)) {
                const a = ctx.art(value.art);
                return {
                    assetId: a.assetId,
                    alt: value.alt ?? a.alt,
                    ...(value.caption !== undefined && { caption: value.caption })
                };
            }
            return value;
        case 'core/asset-list':
            return Array.isArray(value)
                ? value.map(v =>
                      isArtRef(v)
                          ? {
                                assetId: ctx.art(v.art).assetId,
                                alt: v.alt ?? ctx.art(v.art).alt,
                                ...(v.caption !== undefined && { caption: v.caption })
                            }
                          : v
                  )
                : value;
        case 'core/url':
            return isArtRef(value) ? ctx.art(value.art).url : value;
        case 'core/block-list':
            return Array.isArray(value) ? value.map(b => prepareBlock(b, ctx)) : value;
        case 'core/list': {
            const item = itemField(field);
            if (!item || !Array.isArray(value)) return value;
            return value.map(v => prepareValue(item, v, ctx));
        }
        case 'core/object': {
            const fields = objectFields(field);
            return isPlainObject(value) ? prepareFields(fields, value, ctx) : value;
        }
        default:
            return value;
    }
}

export function prepareBlock(block: unknown, ctx: PrepareContext): unknown {
    if (!isPlainObject(block) || typeof block.type !== 'string') return block;
    const schema = ctx.blocks[block.type];
    if (!schema || !isPlainObject(block.data)) return block;
    return { ...block, data: prepareFields(schema.fields, block.data, ctx) };
}
