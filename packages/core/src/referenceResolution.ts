import type { Entry, EntryStatus } from '@moteurio/types/Model.js';
import { getEntryForProject } from './entries.js';

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

function allowedStatus(resolved: Entry, statusFilter?: EntryStatus[]): boolean {
    if (!statusFilter || statusFilter.length === 0) return true;
    const s = resolved.status ?? 'draft';
    return statusFilter.includes(s);
}

/**
 * Resolve reference-like values in entry.data (objects with id + type where type is modelId).
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
    _currentModelId: string,
    depth: 0 | 1 | 2,
    visited: Set<string> = new Set(),
    statusFilter?: EntryStatus[],
    entryResolver: EntryResolver = getEntryForProject
): Promise<Entry> {
    if (depth === 0 || !entry.data) return { ...entry, data: { ...entry.data } };

    const data: Record<string, any> = {};
    for (const [key, value] of Object.entries(entry.data)) {
        if (isReferenceLike(value)) {
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
                    entryResolver
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
                            entryResolver
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
