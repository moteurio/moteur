import type { Asset } from '@moteurio/types/Asset.js';
import type { Entry } from '@moteurio/types/Model.js';
import type { StaticPage, CollectionPage } from '@moteurio/types/Page.js';
import type { ModelSchema } from '@moteurio/types/Model.js';
import type { TemplateSchema } from '@moteurio/types/Template.js';
import type { Field } from '@moteurio/types/Field.js';
import { getAsset } from './assetService.js';

export type AssetFieldValue = { assetId: string; alt?: string; caption?: string };
export type ResolvedAssetValue = AssetFieldValue & {
    alt: string;
    caption: string;
    _resolved?: Asset;
};

function isAssetValue(v: unknown): v is AssetFieldValue {
    return (
        v !== null &&
        typeof v === 'object' &&
        'assetId' in v &&
        typeof (v as AssetFieldValue).assetId === 'string'
    );
}

export async function resolveAsset(
    projectId: string,
    value: AssetFieldValue | null | undefined
): Promise<ResolvedAssetValue | null> {
    if (!value?.assetId) return null;
    const asset = await getAsset(projectId, value.assetId);
    if (!asset) return { ...value, alt: value.alt ?? '', caption: value.caption ?? '' };
    return {
        assetId: value.assetId,
        alt: value.alt ?? asset.alt ?? '',
        caption: value.caption ?? asset.caption ?? '',
        _resolved: asset
    };
}

export async function resolveAssetList(
    projectId: string,
    values: (AssetFieldValue | null | undefined)[] | null | undefined
): Promise<ResolvedAssetValue[]> {
    if (!Array.isArray(values)) return [];
    const out: ResolvedAssetValue[] = [];
    for (const v of values) {
        if (!isAssetValue(v)) continue;
        const resolved = await resolveAsset(projectId, v);
        if (resolved) out.push(resolved);
    }
    return out;
}

function getFieldType(field: Field): string {
    return (field as any).type ?? 'core/text';
}

export async function resolveEntryAssets(
    projectId: string,
    entry: Entry,
    modelSchema: ModelSchema
): Promise<Entry> {
    if (!entry.data || !modelSchema.fields) return entry;
    const data: Record<string, any> = {};
    for (const [key, value] of Object.entries(entry.data)) {
        const field = modelSchema.fields[key];
        const type = field ? getFieldType(field) : '';
        if (type === 'core/asset') {
            data[key] = await resolveAsset(projectId, value);
            continue;
        }
        if (type === 'core/asset-list') {
            data[key] = await resolveAssetList(projectId, value);
            continue;
        }
        data[key] = value;
    }
    return { ...entry, data };
}

export async function resolvePageAssets(
    projectId: string,
    page: StaticPage | CollectionPage,
    templateSchema: TemplateSchema
): Promise<StaticPage | CollectionPage> {
    if (!page.fields || !templateSchema.fields) return page;
    const fields: Record<string, any> = {};
    for (const [key, value] of Object.entries(page.fields)) {
        const field = templateSchema.fields[key];
        const type = field ? getFieldType(field) : '';
        if (type === 'core/asset') {
            fields[key] = await resolveAsset(
                projectId,
                value as AssetFieldValue | null | undefined
            );
            continue;
        }
        if (type === 'core/asset-list') {
            fields[key] = await resolveAssetList(
                projectId,
                value as (AssetFieldValue | null | undefined)[] | null | undefined
            );
            continue;
        }
        fields[key] = value;
    }
    return { ...page, fields };
}
