import type { RadarGraph, RadarGraphEntry } from '@moteurio/types/Radar.js';
import { getProjectById } from '../projects.js';
import { projectRecords, projectReferences } from '../contentReferences.js';

/**
 * Build the in-memory content graph for Radar scans.
 * Used for cross-record rules (broken-relation, orphaned-entry, links to pages).
 */
export async function buildRadarGraph(projectId: string): Promise<RadarGraph> {
    const project = await getProjectById(projectId);
    const locales = project
        ? [project.defaultLocale, ...(project.supportedLocales ?? [])].filter(Boolean)
        : [];

    const { records, entries: loaded, pages } = await projectRecords(projectId);
    const entries = new Map<string, RadarGraphEntry>();
    const models: RadarGraph['models'] = new Map();
    for (const { entry, schema } of loaded) {
        if (!models.has(schema.id))
            models.set(schema.id, {
                id: schema.id,
                fields: Object.fromEntries(
                    Object.entries(schema.fields ?? {}).map(([k, f]) => [
                        k,
                        { type: f.type, options: f.options }
                    ])
                )
            });
        entries.set(entry.id, {
            slug: entry.id,
            modelId: schema.id,
            data: entry.data ?? {},
            status: entry.status,
            meta: entry.meta
        });
    }

    // Relations at any depth, stored as a plain id or as { id }.
    const references = await projectReferences(projectId, records);

    // Who points to each entry: other entries, or pages.
    const referrers = new Map<string, string[]>();
    for (const ref of references) {
        if (ref.to.kind !== 'entry') continue;
        const arr = referrers.get(ref.to.id) ?? [];
        if (!arr.includes(ref.from.id)) arr.push(ref.from.id);
        referrers.set(ref.to.id, arr);
    }

    return {
        entries,
        models,
        referrers,
        locales,
        pages: new Map(
            pages.map(p => [
                p.id,
                {
                    id: p.id,
                    label: p.label,
                    type: p.type,
                    ...('status' in p && { status: p.status })
                }
            ])
        ),
        references
    };
}
