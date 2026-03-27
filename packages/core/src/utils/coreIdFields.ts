import { randomUUID } from 'node:crypto';
import type { ModelSchema } from '@moteurio/types/Model.js';

/**
 * Get field IDs that have type core/id (read-only, auto-generated).
 */
export function getCoreIdFieldIds(schema: ModelSchema): string[] {
    if (!schema?.fields) return [];
    return Object.entries(schema.fields)
        .filter(([, f]) => f?.type === 'core/id')
        .map(([id]) => id);
}

/**
 * Strip core/id fields from a data object (for update payloads — these are read-only).
 */
export function stripCoreIdFromData(
    data: Record<string, unknown> | undefined,
    coreIdFields: string[]
): Record<string, unknown> {
    if (!data || coreIdFields.length === 0) return data ?? {};
    const result = { ...data };
    for (const key of coreIdFields) {
        delete result[key];
    }
    return result;
}

/**
 * Ensure core/id fields have auto-generated UUIDs (for create).
 * Overwrites any client-provided values — core/id is never writable.
 */
export function ensureCoreIdValues(
    data: Record<string, unknown> | undefined,
    coreIdFields: string[]
): Record<string, unknown> {
    const result = data ? { ...data } : {};
    for (const key of coreIdFields) {
        result[key] = randomUUID();
    }
    return result;
}
