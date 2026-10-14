import type { Request } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import type { EntryStatus } from '@moteurio/types/Model.js';
import {
    ENTRY_SORT_FIELDS,
    type EntryQuery,
    type EntrySortField
} from '@moteurio/core/contentIndex/index.js';

export const MAX_ENTRY_PAGE_SIZE = 1000;
const STATUSES: ReadonlySet<string> = new Set(['draft', 'in_review', 'published', 'unpublished']);

function single(value: unknown): string | undefined {
    if (Array.isArray(value)) return single(value[0]);
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function nonNegativeInt(raw: string | undefined, name: string): number | undefined {
    if (raw === undefined) return undefined;
    if (!/^\d+$/.test(raw)) throw new Error(`"${name}" must be a non-negative integer`);
    return Number(raw);
}

/**
 * Parse `limit`, `offset`, `sort` (`updatedAt` or `-updatedAt`) and, when allowed, `status`
 * (comma-separated) from the query string. Throws an Error with a 400-worthy message.
 */
export function parseEntryQuery(req: Request, options: { allowStatus: boolean }): EntryQuery {
    const query: EntryQuery = {};

    const limit = nonNegativeInt(single(req.query.limit), 'limit');
    if (limit !== undefined) {
        if (limit < 1 || limit > MAX_ENTRY_PAGE_SIZE) {
            throw new Error(`"limit" must be between 1 and ${MAX_ENTRY_PAGE_SIZE}`);
        }
        query.limit = limit;
    }
    const offset = nonNegativeInt(single(req.query.offset), 'offset');
    if (offset !== undefined) query.offset = offset;

    const sort = single(req.query.sort);
    if (sort !== undefined) {
        const desc = sort.startsWith('-');
        const field = desc ? sort.slice(1) : sort;
        if (!(ENTRY_SORT_FIELDS as readonly string[]).includes(field)) {
            throw new Error(
                `"sort" must be one of ${ENTRY_SORT_FIELDS.join(', ')} (prefix - for descending)`
            );
        }
        query.sort = { field: field as EntrySortField, direction: desc ? 'desc' : 'asc' };
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

    return query;
}

/** OpenAPI parameters for parseEntryQuery. */
export function entryQueryParameters(options: {
    allowStatus: boolean;
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
    return params;
}
