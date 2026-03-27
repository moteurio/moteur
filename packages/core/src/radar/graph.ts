import type { Entry } from '@moteurio/types/Model.js';
import type { RadarGraph, RadarGraphEntry } from '@moteurio/types/Radar.js';
import { getProjectJson, listProjectKeys } from '../utils/projectStorage.js';
import { modelListPrefix, entryKey, entryListPrefix } from '../utils/storageKeys.js';
import { getProjectById } from '../projects.js';
import { getModelSchemaForProject } from '../models.js';

/**
 * Build the in-memory content graph for Radar scans.
 * Used for cross-entry rules (broken-relation, orphaned-entry).
 */
export async function buildRadarGraph(projectId: string): Promise<RadarGraph> {
    const project = await getProjectById(projectId);
    const locales = project
        ? [project.defaultLocale, ...(project.supportedLocales ?? [])].filter(Boolean)
        : [];

    const modelIds = await listProjectKeys(projectId, modelListPrefix());
    const entries = new Map<string, RadarGraphEntry>();
    const models = new Map<
        string,
        { id: string; fields: Record<string, { type?: string; options?: Record<string, unknown> }> }
    >();
    const referrers = new Map<string, string[]>();

    for (const modelId of modelIds) {
        const schema = await getModelSchemaForProject(projectId, modelId);
        if (!schema) continue;
        models.set(modelId, {
            id: schema.id,
            fields: Object.fromEntries(
                Object.entries(schema.fields ?? {}).map(([k, f]) => [
                    k,
                    { type: f.type, options: f.options }
                ])
            )
        });

        const entryIds = await listProjectKeys(projectId, entryListPrefix(modelId));
        for (const entryId of entryIds) {
            const key = entryKey(modelId, entryId);
            const entry = await getProjectJson<Entry>(projectId, key);
            if (!entry) continue;
            const slug = entry.id;
            entries.set(slug, {
                slug,
                modelId,
                data: entry.data ?? {},
                status: entry.status,
                meta: entry.meta
            });
        }
    }

    // Build referrers: for each entry, who points to it via core/relation or core/relations
    for (const [, e] of entries) {
        const model = models.get(e.modelId);
        if (!model) continue;
        for (const [fieldKey, fieldDef] of Object.entries(model.fields)) {
            const type = fieldDef?.type;
            const value = e.data[fieldKey];
            if (type === 'core/relation' && value != null) {
                const refId =
                    typeof value === 'object' && value !== null && 'id' in value
                        ? (value as { id: string }).id
                        : typeof value === 'string'
                          ? value
                          : null;
                if (refId && refId.trim() !== '') {
                    const arr = referrers.get(refId) ?? [];
                    if (!arr.includes(e.slug)) arr.push(e.slug);
                    referrers.set(refId, arr);
                }
            }
            if (type === 'core/relations' && Array.isArray(value)) {
                for (const item of value) {
                    const refId =
                        typeof item === 'object' && item !== null && 'id' in item
                            ? (item as { id: string }).id
                            : null;
                    if (refId && refId.trim() !== '') {
                        const arr = referrers.get(refId) ?? [];
                        if (!arr.includes(e.slug)) arr.push(e.slug);
                        referrers.set(refId, arr);
                    }
                }
            }
        }
    }

    return { entries, models, referrers, locales };
}
