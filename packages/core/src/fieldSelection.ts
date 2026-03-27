import type { Entry } from '@moteurio/types/Model.js';

/**
 * Returns a new entry with only the specified top-level field names.
 * If fields is null/empty, returns entry as-is (shallow copy).
 * Never mutates the original entry.
 */
export function selectFields(entry: Entry, fields: string[] | null | undefined): Entry {
    if (!fields || fields.length === 0) {
        return { ...entry, data: entry.data ? { ...entry.data } : {} };
    }
    const set = new Set(fields);
    const data: Record<string, any> = {};
    if (entry.data) {
        for (const key of Object.keys(entry.data)) {
            if (set.has(key)) data[key] = entry.data[key];
        }
    }
    return {
        ...entry,
        data
    };
}

/**
 * Applies selectFields to each entry in the list. Does not mutate original entries.
 */
export function selectFieldsFromList(
    entries: Entry[],
    fields: string[] | null | undefined
): Entry[] {
    return entries.map(e => selectFields(e, fields));
}
