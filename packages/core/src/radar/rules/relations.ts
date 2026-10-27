import type { RadarRuleContext } from './types.js';

/** A relation of the entry being checked: where it sits, and the id it names. */
export type EntryRelation = { path: string; id: string };

const idsOf = (value: unknown): string[] => {
    if (typeof value === 'string') return value.trim() ? [value] : [];
    if (Array.isArray(value)) return value.flatMap(idsOf);
    if (value && typeof value === 'object' && 'id' in value) {
        const id = (value as { id: unknown }).id;
        return typeof id === 'string' && id.trim() ? [id] : [];
    }
    return [];
};

/**
 * The entry's relations to other entries. From the graph's references when it has them (at any
 * depth); otherwise its top-level relation fields.
 */
export function entryRelations({ entry, model, graph }: RadarRuleContext): EntryRelation[] {
    if (graph.references)
        return graph.references
            .filter(r => r.from.kind === 'entry' && r.from.id === entry.slug)
            .flatMap(r => (r.to.kind === 'entry' ? [{ path: r.path, id: r.to.id }] : []));
    const out: EntryRelation[] = [];
    for (const [key, field] of Object.entries(model.fields)) {
        if (field?.type !== 'core/relation' && field?.type !== 'core/relations') continue;
        if (field.options?.target === 'pages') continue;
        for (const id of idsOf(entry.data[key])) out.push({ path: key, id });
    }
    return out;
}
