import type { Entry, ModelSchema } from '@moteurio/types/Model.js';
import type { Field } from '@moteurio/types/Field.js';
import type { PageNode } from '@moteurio/types/Page.js';
import type { TemplateSchema } from '@moteurio/types/Template.js';
import type { ContentReference } from '@moteurio/types/References.js';
import { fieldWalkSchemas, walkFields, type FieldWalkSchemas } from './fieldWalk.js';
import { getModelSchemaForProject } from './models.js';
import { listPages } from './pages.js';
import { listTemplates } from './templates.js';
import { pointsAtEntries, referenceOf } from './referenceResolution.js';
import { getProjectJson, listProjectKeys } from './utils/projectStorage.js';
import { entryKey, entryListPrefix, modelListPrefix } from './utils/storageKeys.js';
import { isPlainObject } from './validators/fieldValueUtils.js';

/** An entry or a page, with the fields it is read by. */
export type ContentRecord = {
    kind: 'entry' | 'page';
    id: string;
    /** For an entry: its model. */
    modelId?: string;
    /** A name to show: the page's label, or the entry's title when it has one. */
    label?: string;
    values: Record<string, unknown> | undefined;
    fields: Record<string, Field> | undefined;
};

export type { ContentReference };

const idOf = (value: unknown): string | null => {
    const id = isPlainObject(value) ? (value as { id?: unknown }).id : value;
    return typeof id === 'string' && id.trim() !== '' ? id : null;
};

/** Everything a record points at, at any depth (blocks, lists, structures, variants). */
export async function referencesIn(
    record: ContentRecord,
    schemas: FieldWalkSchemas
): Promise<ContentReference[]> {
    const from = {
        kind: record.kind,
        id: record.id,
        ...(record.modelId && { modelId: record.modelId }),
        ...(record.label && { label: record.label })
    };
    const found: ContentReference[] = [];
    await walkFields(record.values, record.fields, schemas, (value, field, path) => {
        if (field.type === 'core/link') {
            const pageId = isPlainObject(value) ? (value as { pageId?: unknown }).pageId : null;
            if (typeof pageId === 'string' && pageId.trim())
                found.push({ from, path, via: 'link', to: { kind: 'page', id: pageId } });
            return undefined;
        }
        if (field.type !== 'core/relation' && field.type !== 'core/relations') return undefined;
        const items = field.type === 'core/relations' && Array.isArray(value) ? value : [value];
        for (const item of items) {
            if (field.options?.target === 'pages') {
                const id = idOf(item);
                if (id) found.push({ from, path, via: 'relation', to: { kind: 'page', id } });
            } else if (pointsAtEntries(field)) {
                const ref = referenceOf(item, field);
                if (ref)
                    found.push({
                        from,
                        path,
                        via: 'relation',
                        to: { kind: 'entry', modelId: ref.modelId, id: ref.id }
                    });
            }
        }
        return undefined;
    });
    return found;
}

/** The title an entry shows, when one of the usual fields holds a string (or one per language). */
function titleOf(data: Record<string, unknown> | undefined): string | undefined {
    for (const key of ['title', 'name', 'label']) {
        const v = data?.[key];
        if (typeof v === 'string' && v.trim()) return v;
        if (isPlainObject(v)) {
            const first = Object.values(v).find(x => typeof x === 'string' && x.trim());
            if (typeof first === 'string') return first;
        }
    }
    return undefined;
}

/** Every entry and page of a project, with their fields: what references are read from. */
export async function projectRecords(projectId: string): Promise<{
    records: ContentRecord[];
    entries: { entry: Entry; schema: ModelSchema }[];
    pages: PageNode[];
}> {
    const entries: { entry: Entry; schema: ModelSchema }[] = [];
    for (const modelId of await listProjectKeys(projectId, modelListPrefix())) {
        const schema = await getModelSchemaForProject(projectId, modelId);
        if (!schema) continue;
        for (const entryId of await listProjectKeys(projectId, entryListPrefix(modelId))) {
            const entry = await getProjectJson<Entry>(projectId, entryKey(modelId, entryId));
            if (entry) entries.push({ entry, schema });
        }
    }
    const pages = await listPages(projectId);
    const templates = new Map<string, TemplateSchema>(
        (await listTemplates(projectId)).map(t => [t.id, t])
    );
    const records: ContentRecord[] = entries.map(({ entry, schema }) => ({
        kind: 'entry',
        id: entry.id,
        modelId: schema.id,
        label: titleOf(entry.data),
        values: entry.data,
        fields: schema.fields
    }));
    for (const page of pages)
        if (page.type !== 'folder')
            records.push({
                kind: 'page',
                id: page.id,
                label: page.label,
                values: page.fields,
                fields: templates.get(page.templateId)?.fields as Record<string, Field> | undefined
            });
    return { records, entries, pages };
}

/** Every reference in a project, read once (Radar, "what links here"). */
export async function projectReferences(
    projectId: string,
    records?: ContentRecord[]
): Promise<ContentReference[]> {
    const schemas = await fieldWalkSchemas(projectId);
    const all = records ?? (await projectRecords(projectId)).records;
    const out: ContentReference[] = [];
    for (const record of all) out.push(...(await referencesIn(record, schemas)));
    return out;
}

/** The entries and pages that link to a page or relate to it: what deleting it would break. */
export async function pageReferrers(
    projectId: string,
    pageId: string
): Promise<ContentReference[]> {
    return (await projectReferences(projectId)).filter(
        r =>
            r.to.kind === 'page' &&
            r.to.id === pageId &&
            !(r.from.kind === 'page' && r.from.id === pageId)
    );
}
