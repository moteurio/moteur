import { getStudioHost } from './host.js';
import { readLocalizedString } from './locale.js';

export type StudioAssetListItem = {
    id: string;
    filename: string;
    mimeType?: string;
    type?: string;
};

function normalizeAssetList(data: unknown): StudioAssetListItem[] {
    const rows = Array.isArray(data)
        ? data
        : data && typeof data === 'object' && Array.isArray((data as { assets?: unknown }).assets)
          ? (data as { assets: unknown[] }).assets
          : [];
    const out: StudioAssetListItem[] = [];
    for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const o = row as Record<string, unknown>;
        const id = typeof o.id === 'string' ? o.id : undefined;
        const filename = typeof o.filename === 'string' ? o.filename : undefined;
        if (!id || !filename) continue;
        const item: StudioAssetListItem = { id, filename };
        if (typeof o.mimeType === 'string') item.mimeType = o.mimeType;
        if (typeof o.type === 'string') item.type = o.type;
        out.push(item);
    }
    return out;
}

/** Lists the project's media library entries. It needs `fetchProject` on the Studio host and returns an empty list without it. */
export async function listProjectAssets(projectId: string): Promise<StudioAssetListItem[]> {
    const host = getStudioHost();
    if (!host.fetchProject) return [];
    const res = await host.fetchProject(projectId, '/assets');
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    return normalizeAssetList(data);
}

function pickUrl(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim()) return value.trim();
    const loc = readLocalizedString(value);
    return loc || undefined;
}

/** Resolves a `core/url`, `core/asset` or `model-3d` value to a URL that can be fetched. */
export async function resolveMediaRef(
    projectId: string | undefined,
    ref: unknown
): Promise<string | undefined> {
    if (!ref) return undefined;
    if (typeof ref === 'string') return ref.trim() || undefined;
    if (typeof ref !== 'object' || Array.isArray(ref)) return undefined;
    const o = ref as Record<string, unknown>;
    const direct = pickUrl(o.src) ?? pickUrl(o.source) ?? pickUrl(o.url);
    if (direct) return direct;
    const assetId = typeof o.assetId === 'string' ? o.assetId : undefined;
    if (!projectId || !assetId) return undefined;
    const host = getStudioHost();
    return host.resolveAssetUrl?.(projectId, assetId);
}
