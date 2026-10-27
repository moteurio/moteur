import type { Entry, EntryStatus, ModelSchema } from '@moteurio/types/Model.js';
import type { Field } from '@moteurio/types/Field.js';
import { getEntryForProject } from './entries.js';
import { walkFields, type FieldWalkSchemas } from './fieldWalk.js';

export type EntryResolver = (
    projectId: string,
    modelId: string,
    entryId: string
) => Promise<Entry | null>;

function isReferenceLike(value: unknown): value is { id: string; type: string } {
    return (
        value !== null &&
        typeof value === 'object' &&
        'id' in value &&
        'type' in value &&
        typeof (value as { id: unknown }).id === 'string' &&
        typeof (value as { type: unknown }).type === 'string'
    );
}

/**
 * What a schema-aware resolution reads: each model's schema, and the project's blocks and
 * structures to walk into. With it, relations stored as plain ids (as Studio keeps them) resolve
 * wherever they sit: in blocks, lists, structures and variants.
 */
export type ReferenceSchemas = {
    model: (modelId: string) => Promise<ModelSchema | null>;
    walk: FieldWalkSchemas;
};

const RELATION_TYPES = ['core/relation', 'core/relations'];

/** A relation field to entries (page relations are resolved by pageLinks). */
export const pointsAtEntries = (field: Field | undefined): field is Field =>
    !!field && RELATION_TYPES.includes(field.type) && field.options?.target !== 'pages';

/** The model and id a stored relation value names: a plain id, or `{ id }` / `{ id, type }`. */
export function referenceOf(value: unknown, field: Field): { modelId: string; id: string } | null {
    const model = typeof field.options?.model === 'string' ? field.options.model : undefined;
    if (typeof value === 'string' && value.trim() && model) return { modelId: model, id: value };
    if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') {
        const type = (value as { type?: unknown }).type;
        const modelId = typeof type === 'string' ? type : model;
        if (modelId) return { modelId, id: (value as { id: string }).id };
    }
    return null;
}

function allowedStatus(resolved: Entry, statusFilter?: EntryStatus[]): boolean {
    if (!statusFilter || statusFilter.length === 0) return true;
    const s = resolved.status ?? 'draft';
    return statusFilter.includes(s);
}

/**
 * Resolve reference-like values in entry.data (objects with id + type where type is modelId).
 * With `schemas`, relation fields resolve by the model's schema too, at any depth and whatever
 * the stored shape (a plain id, `{ id }`, `{ id, type }`).
 * Depth 0 = no resolution. 1 = one level, 2 = two levels. Uses a visited set to avoid cycles.
 * When statusFilter is provided, resolved entries are only inlined if their status is in the filter (avoids leaking drafts).
 *
 * @param entryResolver - Function used to fetch referenced entries. Defaults to
 *   getEntryForProject (latest draft). Pass getPublishedEntryForProject in public
 *   API paths to ensure referenced entries return their frozen published content.
 */
export async function resolveEntryReferences(
    entry: Entry,
    projectId: string,
    currentModelId: string,
    depth: 0 | 1 | 2,
    visited: Set<string> = new Set(),
    statusFilter?: EntryStatus[],
    entryResolver: EntryResolver = getEntryForProject,
    schemas?: ReferenceSchemas
): Promise<Entry> {
    if (depth === 0 || !entry.data) return { ...entry, data: { ...entry.data } };

    const schema = schemas ? await schemas.model(currentModelId) : null;
    const relationKeys = new Set(
        Object.entries(schema?.fields ?? {})
            .filter(([, field]) => pointsAtEntries(field))
            .map(([key]) => key)
    );
    let source: Record<string, any> = entry.data;
    if (schema && schemas) {
        const inline = async (value: unknown, field: Field): Promise<unknown> => {
            const ref = referenceOf(value, field);
            if (!ref) return value;
            const refKey = `${ref.modelId}:${ref.id}`;
            if (visited.has(refKey)) return value;
            const resolved = await entryResolver(projectId, ref.modelId, ref.id);
            if (!resolved || !allowedStatus(resolved, statusFilter)) return value;
            return resolveEntryReferences(
                resolved,
                projectId,
                ref.modelId,
                (depth - 1) as 0 | 1 | 2,
                new Set(visited).add(refKey),
                statusFilter,
                entryResolver,
                schemas
            );
        };
        source = (await walkFields(
            entry.data,
            schema.fields,
            schemas.walk,
            async (value, field) => {
                if (!pointsAtEntries(field)) return undefined;
                if (field.type === 'core/relation') return inline(value, field);
                if (!Array.isArray(value)) return value;
                const out = [];
                for (const item of value) out.push(await inline(item, field));
                return out;
            }
        )) as Record<string, any>;
    }

    const data: Record<string, any> = {};
    for (const [key, value] of Object.entries(source)) {
        // Already resolved by its schema above (an inlined entry also has an id and a type).
        if (relationKeys.has(key)) {
            data[key] = value;
        } else if (isReferenceLike(value)) {
            const refKey = `${value.type}:${value.id}`;
            if (visited.has(refKey)) {
                data[key] = value;
                continue;
            }
            const resolved = await entryResolver(projectId, value.type, value.id);
            if (resolved && allowedStatus(resolved, statusFilter)) {
                const nextDepth = (depth - 1) as 0 | 1 | 2;
                const visitedNext = new Set(visited).add(refKey);
                const resolvedNested = await resolveEntryReferences(
                    resolved,
                    projectId,
                    value.type,
                    nextDepth,
                    visitedNext,
                    statusFilter,
                    entryResolver,
                    schemas
                );
                data[key] = resolvedNested;
            } else {
                data[key] = value;
            }
        } else if (Array.isArray(value)) {
            const arr: any[] = [];
            for (const item of value) {
                if (isReferenceLike(item)) {
                    const refKey = `${item.type}:${item.id}`;
                    if (visited.has(refKey)) {
                        arr.push(item);
                        continue;
                    }
                    const resolved = await entryResolver(projectId, item.type, item.id);
                    if (resolved && allowedStatus(resolved, statusFilter)) {
                        const nextDepth = (depth - 1) as 0 | 1 | 2;
                        const visitedNext = new Set(visited).add(refKey);
                        const resolvedNested = await resolveEntryReferences(
                            resolved,
                            projectId,
                            item.type,
                            nextDepth,
                            visitedNext,
                            statusFilter,
                            entryResolver,
                            schemas
                        );
                        arr.push(resolvedNested);
                    } else {
                        arr.push(item);
                    }
                } else {
                    arr.push(item);
                }
            }
            data[key] = arr;
        } else {
            data[key] = value;
        }
    }
    return { ...entry, data };
}
