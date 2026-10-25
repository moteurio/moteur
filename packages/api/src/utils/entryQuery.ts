import type { Request } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import type { EntryStatus } from '@moteurio/types/Model.js';
import {
    ENTRY_SORT_FIELDS,
    LIST_KEY,
    type EntryQuery,
    type EntrySortField
} from '@moteurio/core/contentIndex/index.js';

export const MAX_ENTRY_PAGE_SIZE = 1000;
const STATUSES: ReadonlySet<string> = new Set(['draft', 'in_review', 'published', 'unpublished']);

const LOCALE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
/** Most values a single filter, group order or field list may hold. */
const MAX_LIST = 500;

function single(value: unknown): string | undefined {
    if (Array.isArray(value)) return single(value[0]);
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function nonNegativeInt(raw: string | undefined, name: string): number | undefined {
    if (raw === undefined) return undefined;
    if (!/^\d+$/.test(raw)) throw new Error(`"${name}" must be a non-negative integer`);
    return Number(raw);
}

/** Every value of a repeatable, comma-separated parameter. */
function list(value: unknown, name: string): string[] | undefined {
    const raw = (Array.isArray(value) ? value : [value]).filter(
        (v): v is string => typeof v === 'string'
    );
    if (raw.length === 0) return undefined;
    const out = raw
        .flatMap(v => v.split(','))
        .map(v => v.trim())
        .filter(Boolean);
    if (out.length > MAX_LIST) throw new Error(`"${name}" takes at most ${MAX_LIST} values`);
    return out;
}

function listKey(key: string, name: string): string {
    if (!LIST_KEY.test(key)) throw new Error(`"${name}": "${key}" is not a field name`);
    return key;
}

/** `title:fr,en` → { field: 'title', locales: ['fr', 'en'] }. */
function fieldLocales(raw: string | undefined, name: string) {
    if (raw === undefined) return undefined;
    const colon = raw.indexOf(':');
    const field = listKey(colon < 0 ? raw : raw.slice(0, colon), name);
    const locales = (list(colon < 0 ? '' : raw.slice(colon + 1), name) ?? []).filter(Boolean);
    if (locales.length === 0 || locales.some(l => !LOCALE.test(l))) {
        throw new Error(`"${name}" must look like title:fr,en`);
    }
    return { field, locales };
}

/**
 * Parse `limit`, `offset`, `sort` (`updatedAt` or `-updatedAt`) and, when allowed, `status`
 * (comma-separated) from the query string. With `allowList` (the Studio's entry lists), also
 * `q`, `filter.<key>`, `missing`, `data.<field>` sorts with `sortLocale`, `group` with
 * `groupOrder`, `facets`, `missingCounts`, `fields`, and `limit=0` for counts only.
 * Throws an Error with a 400-worthy message.
 */
export function parseEntryQuery(
    req: Request,
    options: { allowStatus: boolean; allowList?: boolean }
): EntryQuery {
    const query: EntryQuery = {};

    const limit = nonNegativeInt(single(req.query.limit), 'limit') ?? 100;
    if (limit !== undefined) {
        const min = options.allowList ? 0 : 1;
        if (limit < min || limit > MAX_ENTRY_PAGE_SIZE) {
            throw new Error(`"limit" must be between ${min} and ${MAX_ENTRY_PAGE_SIZE}`);
        }
        query.limit = limit;
    }
    const offset = nonNegativeInt(single(req.query.offset), 'offset');
    if (offset !== undefined) query.offset = offset;

    const sort = single(req.query.sort);
    if (sort !== undefined) {
        const desc = sort.startsWith('-');
        const field = desc ? sort.slice(1) : sort;
        if (options.allowList && field.startsWith('data.')) {
            const sortLocale = single(req.query.sortLocale);
            if (sortLocale !== undefined && !LOCALE.test(sortLocale)) {
                throw new Error('"sortLocale" must be a language code');
            }
            query.sort = {
                field: 'data',
                key: listKey(field.slice(5), 'sort'),
                ...(sortLocale && { locale: sortLocale }),
                direction: desc ? 'desc' : 'asc'
            };
        } else if (!(ENTRY_SORT_FIELDS as readonly string[]).includes(field)) {
            throw new Error(
                `"sort" must be one of ${ENTRY_SORT_FIELDS.join(', ')}${options.allowList ? ' or data.<field>' : ''} (prefix - for descending)`
            );
        } else {
            query.sort = { field: field as EntrySortField, direction: desc ? 'desc' : 'asc' };
        }
    }

    if (options.allowStatus) {
        const status = single(req.query.status);
        if (status !== undefined) {
            const list = status
                .split(',')
                .map(s => s.trim())
                .filter(Boolean);
            const invalid = list.filter(s => !STATUSES.has(s));
            if (invalid.length > 0) throw new Error(`Unknown status: ${invalid.join(', ')}`);
            query.status = list as EntryStatus[];
        }
    }

    if (options.allowList) {
        const q = single(req.query.q);
        if (q !== undefined) query.search = q.slice(0, 200);

        for (const [name, value] of Object.entries(req.query)) {
            if (!name.startsWith('filter.')) continue;
            const key = listKey(name.slice(7), name);
            const values = list(value, name);
            if (values?.length) (query.filters ??= {})[key] = values;
        }

        const missing = fieldLocales(single(req.query.missing), 'missing');
        if (missing) query.missing = missing;
        const missingCounts = fieldLocales(single(req.query.missingCounts), 'missingCounts');
        if (missingCounts) query.missingCounts = missingCounts;

        const group = single(req.query.group);
        if (group !== undefined) {
            query.group = { key: listKey(group, 'group') };
            const order = list(req.query.groupOrder, 'groupOrder');
            if (order?.length) query.group.order = order;
        }

        const facets = list(req.query.facets, 'facets');
        if (facets?.length) query.facets = facets.map(k => listKey(k, 'facets'));
        const fields = list(req.query.fields, 'fields');
        if (fields?.length) query.fields = fields.map(k => listKey(k, 'fields'));
    }

    return query;
}

/** OpenAPI parameters for parseEntryQuery. */
export function entryQueryParameters(options: {
    allowStatus: boolean;
    allowList?: boolean;
}): OpenAPIV3.ParameterObject[] {
    const params: OpenAPIV3.ParameterObject[] = [
        {
            name: 'limit',
            in: 'query',
            required: false,
            description: `Page size (1–${MAX_ENTRY_PAGE_SIZE}). Omit for every matching entry.`,
            schema: { type: 'integer', minimum: 1, maximum: MAX_ENTRY_PAGE_SIZE }
        },
        {
            name: 'offset',
            in: 'query',
            required: false,
            description: 'Number of matching entries to skip.',
            schema: { type: 'integer', minimum: 0 }
        },
        {
            name: 'sort',
            in: 'query',
            required: false,
            description: `Sort field (${ENTRY_SORT_FIELDS.join(', ')}); prefix with - for descending. Default: id.`,
            schema: { type: 'string', example: '-updatedAt' }
        }
    ];
    if (options.allowStatus) {
        params.push({
            name: 'status',
            in: 'query',
            required: false,
            description: 'Comma-separated statuses (draft, in_review, published, unpublished).',
            schema: { type: 'string' }
        });
    }
    if (options.allowList) {
        const text = (name: string, description: string, example?: string) =>
            params.push({
                name,
                in: 'query',
                required: false,
                description,
                schema: { type: 'string', ...(example && { example }) }
            });
        text('q', 'Words to find in the id and short text fields (case and accents ignored).');
        params.push({
            name: 'filter',
            in: 'query',
            required: false,
            style: 'form',
            explode: true,
            description:
                'One parameter per key, `filter.<field>=a,b`: entries whose field holds any of the values. ' +
                'Virtual keys: `filter.$workflow` (status, plus `edits`), `filter.$editor`, `filter.$creator`.',
            schema: { type: 'object', additionalProperties: { type: 'string' } }
        });
        text(
            'missing',
            'Entries missing at least one of these languages in a field.',
            'title:fr,en'
        );
        text('sortLocale', 'Language to read a localized field in for `sort=data.<field>`.', 'fr');
        text('group', 'Return rows grouped by this field or virtual key.', 'issue');
        text('groupOrder', 'Comma-separated group values, in display order.');
        text('facets', 'Keys to count matching entries for, per value.', 'issue,$workflow');
        text('missingCounts', 'Count matching entries missing each language.', 'title:fr,en');
        text('fields', 'Data fields to return (row summaries).', 'title,excerpt,cover');
    }
    return params;
}
