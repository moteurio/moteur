import type { Asset, AssetText } from '@moteurio/types/Asset.js';
import type { Entry } from '@moteurio/types/Model.js';
import type { StaticPage, CollectionPage } from '@moteurio/types/Page.js';
import type { ModelSchema } from '@moteurio/types/Model.js';
import type { TemplateSchema } from '@moteurio/types/Template.js';
import type { Field } from '@moteurio/types/Field.js';
import { getAsset } from './assetService.js';
import { RESIZE_RATIOS } from './resize.js';
import {
    fieldWalkSchemas,
    walkFields,
    type FieldVisitor,
    type FieldWalkSchemas
} from '../fieldWalk.js';

/** A field's own alt and caption override the asset's; either may be one per language. */
export type AssetFieldValue = { assetId: string; alt?: AssetText; caption?: AssetText };
export type ResolvedAssetValue = AssetFieldValue & {
    alt: AssetText;
    caption: AssetText;
    _resolved?: Asset;
    /**
     * For a field cropping its pictures (`aspectRatio`): the picture cropped to that shape
     * around its focal point. Add `&w=` (and `&fmt=`) like `resizeUrl`.
     */
    cropUrl?: string;
    aspectRatio?: string;
};

/** What a field asks of its pictures. */
type FieldOptions = { aspectRatio?: unknown } | undefined;

/** The crop a field's options ask for, when it is one the server makes. */
const cropOf = (options: FieldOptions) =>
    typeof options?.aspectRatio === 'string' && RESIZE_RATIOS[options.aspectRatio]
        ? options.aspectRatio
        : undefined;

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
    value: AssetFieldValue | null | undefined,
    options?: FieldOptions
): Promise<ResolvedAssetValue | null> {
    if (!value?.assetId) return null;
    const asset = await getAsset(projectId, value.assetId);
    if (!asset) return { ...value, alt: value.alt ?? '', caption: value.caption ?? '' };
    const ratio = cropOf(options);
    return {
        assetId: value.assetId,
        alt: value.alt ?? asset.alt ?? '',
        caption: value.caption ?? asset.caption ?? '',
        _resolved: asset,
        ...(ratio &&
            asset.resizeUrl && {
                aspectRatio: ratio,
                cropUrl: `${asset.resizeUrl}&ar=${ratio}`
            })
    };
}

export async function resolveAssetList(
    projectId: string,
    values: (AssetFieldValue | null | undefined)[] | null | undefined,
    options?: FieldOptions
): Promise<ResolvedAssetValue[]> {
    if (!Array.isArray(values)) return [];
    const out: ResolvedAssetValue[] = [];
    for (const v of values) {
        if (!isAssetValue(v)) continue;
        const resolved = await resolveAsset(projectId, v, options);
        if (resolved) out.push(resolved);
    }
    return out;
}

/** Pictures in asset fields, at any depth (in blocks, lists, structures, variants). */
const assetVisitor =
    (projectId: string): FieldVisitor =>
    async (value, field) => {
        if (field.type === 'core/asset')
            return (
                (await resolveAsset(
                    projectId,
                    value as AssetFieldValue | null | undefined,
                    field.options
                )) ?? null
            );
        if (field.type === 'core/asset-list')
            return resolveAssetList(
                projectId,
                value as (AssetFieldValue | null | undefined)[] | null | undefined,
                field.options
            );
        return undefined;
    };

export async function resolveEntryAssets(
    projectId: string,
    entry: Entry,
    modelSchema: ModelSchema,
    schemas?: FieldWalkSchemas
): Promise<Entry> {
    if (!entry.data || !modelSchema.fields) return entry;
    const data = await walkFields(
        entry.data,
        modelSchema.fields,
        schemas ?? (await fieldWalkSchemas(projectId)),
        assetVisitor(projectId)
    );
    return { ...entry, data: data ?? entry.data };
}

export async function resolvePageAssets(
    projectId: string,
    page: StaticPage | CollectionPage,
    templateSchema: TemplateSchema,
    schemas?: FieldWalkSchemas
): Promise<StaticPage | CollectionPage> {
    if (!page.fields || !templateSchema.fields) return page;
    const fields = await walkFields(
        page.fields,
        templateSchema.fields as Record<string, Field>,
        schemas ?? (await fieldWalkSchemas(projectId)),
        assetVisitor(projectId)
    );
    return { ...page, fields } as StaticPage | CollectionPage;
}
