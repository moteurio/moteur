import type { Entry } from '@moteurio/types/Model.js';
import { isLikelyLocaleStringMap, isPlainObject } from '../validators/fieldValueUtils.js';
import { entryStatus, sortValue } from './publishedView.js';
import type { EntryQuery, EntryQueryResult } from './types.js';

/**
 * What a list can search, filter, count and group on, derived from one entry. Indexes store
 * these facts at write time; the in-memory path (applyQuery) derives them per query. Both use
 * this module so the two can't drift.
 */
export type ListFacts = {
    /** [key, value] pairs: one per value of each top-level field, plus the virtual keys. */
    values: Array<[string, string]>;
    /** [field, locale] pairs: languages that have text in each localized field. */
    locales: Array<[string, string]>;
    /** Folded text of the id and the short strings in top-level fields, for search. */
    search: string;
};

/** Longest string treated as a value (filters, groups) or searched: titles, slugs, choices. */
const MAX_VALUE_LENGTH = 200;
const MAX_SEARCH_LENGTH = 500;

/** Lower case without accents, for search and text sorts. */
export function fold(value: unknown): string {
    if (value == null) return '';
    return String(value)
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase();
}

/** A published entry with saves made after publishing. */
export function hasUnpublishedEdits(entry: Entry): boolean {
    const a = entry.meta?.audit;
    return (
        entry.status === 'published' &&
        a?.revision != null &&
        a.publishedRevision != null &&
        a.revision > a.publishedRevision
    );
}

/** A scalar or `{ id }` reference as a filter value; undefined for anything else. */
function asValue(v: unknown): string | undefined {
    if (typeof v === 'string') return v !== '' && v.length <= MAX_VALUE_LENGTH ? v : undefined;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (isPlainObject(v) && typeof v.id === 'string' && v.id !== '') return v.id;
    return undefined;
}

export function listFacts(entry: Entry): ListFacts {
    const values: Array<[string, string]> = [];
    const locales: Array<[string, string]> = [];
    const text: string[] = [entry.id];
    for (const [key, raw] of Object.entries(entry.data ?? {})) {
        if (Array.isArray(raw)) {
            for (const item of raw) {
                const v = asValue(item);
                if (v !== undefined) values.push([key, v]);
            }
            continue;
        }
        // `{ id }` is a reference, even though "id" also looks like a locale code (Indonesian).
        const reference = isPlainObject(raw) && Object.keys(raw).length === 1 && 'id' in raw;
        if (!reference && isLikelyLocaleStringMap(raw)) {
            for (const [locale, s] of Object.entries(raw)) {
                if (s.trim() === '') continue;
                locales.push([key, locale]);
                if (s.length <= MAX_SEARCH_LENGTH) text.push(s);
            }
            continue;
        }
        const v = asValue(raw);
        if (v !== undefined) values.push([key, v]);
        if (typeof raw === 'string' && raw.length <= MAX_SEARCH_LENGTH) text.push(raw);
    }
    const status = entryStatus(entry);
    values.push(['$workflow', status]);
    if (hasUnpublishedEdits(entry)) values.push(['$workflow', 'edits']);
    const audit = entry.meta?.audit;
    if (audit?.updatedBy) values.push(['$editor', audit.updatedBy]);
    if (audit?.createdBy) values.push(['$creator', audit.createdBy]);
    return { values, locales, search: fold(text.join('\n')) };
}

/** The words of a search, folded; an entry matches when its text holds every one. */
export function searchTerms(search: string | undefined): string[] {
    return fold(search ?? '')
        .split(/\s+/)
        .filter(Boolean);
}

/** A field's text for sorting: the locale's text, else the first non-empty language, else ''. */
export function sortText(entry: Entry, key: string, locale?: string): string {
    const raw = entry.data?.[key];
    if (isPlainObject(raw)) {
        const preferred = locale ? raw[locale] : undefined;
        if (typeof preferred === 'string' && preferred.trim()) return fold(preferred);
        const first = Object.values(raw).find(v => typeof v === 'string' && v.trim());
        return typeof first === 'string' ? fold(first) : '';
    }
    if (typeof raw === 'string' || typeof raw === 'number') return fold(raw);
    return '';
}

/** Only the requested data fields, keeping the entry's identity, status and meta. */
export function project(entry: Entry, fields: string[] | undefined): Entry {
    if (!fields) return entry;
    const data: Record<string, unknown> = {};
    for (const f of fields) if (entry.data && f in entry.data) data[f] = entry.data[f];
    return { ...entry, data } as Entry;
}

type Indexed = { entry: Entry; facts: ListFacts; values: Map<string, Set<string>> };

function indexOf(entry: Entry): Indexed {
    const facts = listFacts(entry);
    const values = new Map<string, Set<string>>();
    for (const [k, v] of facts.values) {
        let set = values.get(k);
        if (!set) values.set(k, (set = new Set()));
        set.add(v);
    }
    return { entry, facts, values };
}

function lacksLocale(e: Indexed, field: string, locale: string): boolean {
    return !e.facts.locales.some(([f, l]) => f === field && l === locale);
}

/** Every condition of the query, optionally leaving one filter key or `missing` out. */
function matcher(
    query: EntryQuery,
    skip?: { filter?: string; missing?: boolean }
): (e: Indexed) => boolean {
    const terms = searchTerms(query.search);
    const filters = Object.entries(query.filters ?? {}).filter(
        ([k, v]) => v.length > 0 && k !== skip?.filter
    );
    const missing = skip?.missing ? undefined : query.missing;
    return e => {
        if (query.status && !query.status.includes(entryStatus(e.entry))) return false;
        if (terms.some(t => !e.facts.search.includes(t))) return false;
        for (const [key, wanted] of filters) {
            const have = e.values.get(key);
            if (!have || !wanted.some(v => have.has(v))) return false;
        }
        if (missing && !missing.locales.some(l => lacksLocale(e, missing.field, l))) return false;
        return true;
    };
}

/** Filter, sort, group, count and page entries in memory, with the same semantics as an index. */
export function applyQuery(entries: Entry[], query: EntryQuery): EntryQueryResult {
    const all = entries.map(indexOf);
    const matching = all.filter(matcher(query));

    const sort = query.sort ?? { field: 'id', direction: 'asc' };
    const sign = sort.direction === 'desc' ? -1 : 1;
    const byId = (a: Indexed, b: Indexed) =>
        a.entry.id < b.entry.id ? -sign : a.entry.id > b.entry.id ? sign : 0;
    let compare: (a: Indexed, b: Indexed) => number;
    if (sort.field === 'data') {
        const key = sort.key;
        const locale = sort.locale;
        compare = (a, b) => {
            const av = sortText(a.entry, key, locale);
            const bv = sortText(b.entry, key, locale);
            // Empty values last whatever the direction.
            if (!av !== !bv) return av ? -1 : 1;
            if (av !== bv) return av < bv ? -sign : sign;
            return byId(a, b);
        };
    } else {
        const field = sort.field;
        compare = (a, b) => {
            const av = sortValue(a.entry, field);
            const bv = sortValue(b.entry, field);
            if (av !== bv) return av < bv ? -sign : sign;
            // Ties break on id, in the same direction (lets SQL adapters sort from an index).
            return byId(a, b);
        };
    }

    if (query.group) {
        const { key, order = [] } = query.group;
        // [position in order (unlisted values after, no value last), first unlisted value].
        const rank = (e: Indexed): [number, string] => {
            const values = [...(e.values.get(key) ?? [])];
            if (values.length === 0) return [order.length + 1, ''];
            const positions = values.map(v => order.indexOf(v)).filter(i => i >= 0);
            const unlisted = values.filter(v => !order.includes(v)).sort();
            return [positions.length ? Math.min(...positions) : order.length, unlisted[0] ?? ''];
        };
        const inner = compare;
        compare = (a, b) => {
            const [ar, av] = rank(a);
            const [br, bv] = rank(b);
            if (ar !== br) return ar - br;
            if (av !== bv) return av < bv ? -1 : 1;
            return inner(a, b);
        };
    }

    const sorted = [...matching].sort(compare);
    const offset = query.offset ?? 0;
    const page =
        query.limit != null ? sorted.slice(offset, offset + query.limit) : sorted.slice(offset);
    const result: EntryQueryResult = {
        items: page.map(e => project(e.entry, query.fields)),
        total: matching.length
    };

    if (query.facets?.length) {
        result.facets = {};
        for (const key of query.facets) {
            const counts: Record<string, number> = {};
            for (const e of all.filter(matcher(query, { filter: key }))) {
                for (const v of e.values.get(key) ?? []) counts[v] = (counts[v] ?? 0) + 1;
            }
            result.facets[key] = counts;
        }
    }
    if (query.missingCounts) {
        const { field, locales } = query.missingCounts;
        const base = all.filter(matcher(query, { missing: true }));
        result.missingCounts = Object.fromEntries(
            locales.map(l => [l, base.filter(e => lacksLocale(e, field, l)).length])
        );
    }
    return result;
}
