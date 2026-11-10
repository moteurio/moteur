import type { Asset, AssetText, AssetType } from '@moteurio/types/Asset.js';
import { getAssetTypeFromMime } from './allowedTypes.js';

/** The kinds of file the library distinguishes. */
export const ASSET_KINDS: AssetType[] = ['image', 'video', 'audio', 'model', 'document'];

/** Every string in an asset text field, whether it is one string or one per language. */
export function textValues(value: AssetText | undefined): string[] {
    if (typeof value === 'string') return [value];
    if (value && typeof value === 'object')
        return Object.values(value).filter(v => typeof v === 'string');
    return [];
}

/** The kind of a file: its stored type, otherwise derived from its MIME type. */
export function kindOf(asset: Asset): AssetType {
    if (asset.type && ASSET_KINDS.includes(asset.type)) return asset.type;
    const mime = asset.mimeType ?? '';
    const prefix = mime.split('/')[0];
    if (prefix === 'image' || prefix === 'video' || prefix === 'audio' || prefix === 'model')
        return prefix;
    return getAssetTypeFromMime(mime) ?? 'document';
}

/** Lowercases and removes accents, so a search for "gaspesie" finds "Gaspésie". */
export const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** The text library search covers: the name, title, alt text and caption, in every language. */
export const searchText = (asset: Asset) =>
    [
        asset.filename,
        ...textValues(asset.title),
        ...textValues(asset.alt),
        ...textValues(asset.caption)
    ]
        .filter(Boolean)
        .map(s => fold(s))
        .join('\n');
