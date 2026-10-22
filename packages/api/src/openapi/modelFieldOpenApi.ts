import type { OpenAPIV3 } from 'openapi-types';
import type { Field } from '@moteurio/types/Field.js';

const PRIMITIVE_STRING = new Set([
    'core/text',
    'core/textarea',
    'core/slug',
    'core/url',
    'core/email',
    'core/phone',
    'core/markdown',
    'core/html',
    'core/rich-text',
    'core/color',
    'core/icon',
    'core/id',
    'core/status',
    'core/order',
    'core/date',
    'core/time',
    'core/datetime'
]);

const PRIMITIVE_NUMBER = new Set(['core/number']);

const PRIMITIVE_BOOLEAN = new Set(['core/boolean']);

/** Labels and descriptions may be stored as a locale map ({ fr, en }); OpenAPI needs a string. */
export function plainText(value: unknown, fallback = ''): string {
    if (typeof value === 'string') return value.trim() || fallback;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const map = value as Record<string, unknown>;
        for (const locale of ['en', ...Object.keys(map)]) {
            const v = map[locale];
            if (typeof v === 'string' && v.trim()) return v;
        }
    }
    return fallback;
}

function isMultilingual(field: Field): boolean {
    return Boolean(field.options?.multilingual);
}

function localeValueSchema(inner: OpenAPIV3.SchemaObject): OpenAPIV3.SchemaObject {
    return {
        description:
            'With `locale` or `lang` query param, a single resolved value. Without, may be a locale map.',
        oneOf: [
            inner,
            {
                type: 'object',
                additionalProperties: inner,
                description: 'Locale code → value (when no locale query is set)'
            }
        ]
    };
}

function referenceStub(description?: string): OpenAPIV3.SchemaObject {
    return {
        type: 'object',
        required: ['id', 'type'],
        description:
            description ??
            'Entry reference. When collection `resolve` is 1 or 2, may be replaced by a nested entry object.',
        properties: {
            id: { type: 'string' },
            type: { type: 'string', description: 'Target model id' }
        }
    };
}

/**
 * Map a model field definition to a JSON Schema fragment for `entry.data.<key>`.
 */
export function openApiSchemaForModelField(
    field: Field,
    resolveDepth: 0 | 1 | 2
): OpenAPIV3.SchemaObject {
    const type = field.type ?? 'unknown';
    const desc = plainText(field.description) || plainText(field.label, type);

    if (PRIMITIVE_STRING.has(type)) {
        const s: OpenAPIV3.SchemaObject = { type: 'string', description: desc };
        return isMultilingual(field) ? localeValueSchema(s) : s;
    }
    if (PRIMITIVE_NUMBER.has(type)) {
        const s: OpenAPIV3.SchemaObject = { type: 'number', description: desc };
        return isMultilingual(field) ? localeValueSchema(s) : s;
    }
    if (PRIMITIVE_BOOLEAN.has(type)) {
        const s: OpenAPIV3.SchemaObject = { type: 'boolean', description: desc };
        return isMultilingual(field) ? localeValueSchema(s) : s;
    }
    if (type === 'core/json') {
        return { description: desc, ...{ type: 'object', additionalProperties: true } };
    }
    if (type === 'core/select' || type === 'core/multi-select' || type === 'core/tags') {
        const s: OpenAPIV3.SchemaObject = {
            description: desc,
            oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }]
        };
        return isMultilingual(field) ? localeValueSchema(s) : s;
    }
    if (type === 'core/asset' || type === 'core/image' || type === 'core/video') {
        return {
            type: 'object',
            description: desc,
            additionalProperties: true,
            properties: {
                id: { type: 'string' },
                url: { type: 'string', description: 'Present when `resolveAssets=1`' },
                cropUrl: {
                    type: 'string',
                    description:
                        'With `resolveAssets=1`, for a field set to crop (`aspectRatio`): the picture cropped to that shape around its focal point. Add `&w=` (and `&fmt=`).'
                },
                aspectRatio: { type: 'string', description: 'The crop the field asks for' }
            }
        };
    }
    if (type === 'core/asset-list') {
        return {
            type: 'array',
            description: desc,
            items: openApiSchemaForModelField({ ...field, type: 'core/asset' }, resolveDepth)
        };
    }
    if (type === 'core/relation' || type === 'core/relations') {
        const stub = referenceStub(desc);
        if (resolveDepth === 0) return stub;
        return {
            description: desc,
            oneOf: [
                stub,
                {
                    type: 'object',
                    description: 'Embedded entry when references are resolved',
                    additionalProperties: true
                }
            ]
        };
    }
    if (type === 'core/block-list' || type === 'core/list' || type === 'core/table') {
        return {
            type: 'array',
            description: desc,
            items: { type: 'object', additionalProperties: true }
        };
    }
    if (type === 'core/structure' || type === 'core/object' || type === 'core/layout') {
        return { type: 'object', description: desc, additionalProperties: true };
    }
    return { description: `${desc} (${type})`, additionalProperties: true };
}

export function openApiEntryDataSchema(
    modelLabel: string,
    fields: Record<string, Field>,
    fieldAllowlist: string[] | undefined,
    resolveDepth: 0 | 1 | 2
): OpenAPIV3.SchemaObject {
    const keys =
        fieldAllowlist && fieldAllowlist.length > 0
            ? fieldAllowlist.filter(k => fields[k])
            : Object.keys(fields);

    const properties: Record<string, OpenAPIV3.SchemaObject> = {};
    for (const key of keys) {
        properties[key] = openApiSchemaForModelField(fields[key], resolveDepth);
    }

    return {
        type: 'object',
        description: `Payload for model “${modelLabel}”. Only fields exposed by this collection are listed.`,
        properties,
        additionalProperties: fieldAllowlist?.length ? false : true
    };
}
