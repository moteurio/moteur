import type { Asset, AssetType, ImageVariant } from '@moteurio/types/Asset.js';
import type { VideoProviderId } from '@moteurio/types/Asset.js';
import type { User } from '@moteurio/types/User.js';
import type { ProjectSchema } from '@moteurio/types/Project.js';
import { getProject } from '../projects.js';
import { getProjectJson, putProjectJson } from '../utils/projectStorage.js';
import { ASSETS_KEY } from '../utils/storageKeys.js';
import { triggerEvent } from '../utils/eventBus.js';
import { getProjectAdapter } from './adapterRegistry.js';
import type { VideoProvider } from './VideoProvider.js';
import {
    getActiveProviderForProject,
    getProviderForProject,
    getProvider,
    getVideoProvidersConfig
} from './providerRegistry.js';
import { getVariantDefinitions } from './defaultVariants.js';
import { generateVariants } from './imageTransformer.js';
import { detectVideoDuration } from './videoMetadata.js';
import { isAllowedMime, getAssetTypeFromMime } from './allowedTypes.js';
import { dispatch as webhookDispatch } from '../webhooks/webhookService.js';
import { sanitizeUploadFilename } from './safeUploadFilename.js';

const DEFAULT_MAX_SIZE_MB = 50;

export function resolveAssetUrl(asset: Asset): string {
    if (asset.type === 'video' && asset.provider && asset.providerStatus === 'ready') {
        const streamUrl = asset.providerMetadata?.streamUrl;
        if (streamUrl) return streamUrl;
    }
    return asset.localUrl ?? '';
}

const SYSTEM_USER = {
    id: 'system',
    name: 'System',
    isActive: true,
    email: '',
    roles: [] as string[],
    projects: [] as string[]
};

async function loadAssetsIndex(projectId: string): Promise<Asset[]> {
    const list = await getProjectJson<Asset[]>(projectId, ASSETS_KEY);
    return Array.isArray(list) ? list : [];
}

async function saveAssetsIndex(projectId: string, assets: Asset[], user?: User): Promise<void> {
    const toStore = assets.map(({ url: _u, ...a }) => a);
    await putProjectJson(projectId, ASSETS_KEY, toStore);
    triggerEvent('content.saved', {
        projectId,
        paths: [ASSETS_KEY],
        message: `Update assets — ${user?.name ?? user?.id ?? SYSTEM_USER.name}`,
        user: user ?? SYSTEM_USER
    });
}

export type UploadFile = {
    buffer: Buffer;
    originalName: string;
    mimeType: string;
};

export type UploadOptions = {
    keepLocalCopy?: boolean;
    title?: string;
    alt?: string;
    credit?: string;
    folder?: string;
    generationPrompt?: string;
    aiProvider?: string;
    aiGenerated?: boolean;
};

function generateId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function uploadAsset(
    projectId: string,
    user: User,
    file: UploadFile,
    options?: UploadOptions
): Promise<Asset> {
    const buffer = file.buffer;
    const safeOriginalName = sanitizeUploadFilename(file.originalName);
    const project = await getProject(user, projectId);
    if (project.assetConfig?.enabled === false) {
        throw new Error('Media is disabled for this project');
    }
    const maxSizeMb = project.assetConfig?.maxUploadSizeMb ?? DEFAULT_MAX_SIZE_MB;
    const maxBytes = maxSizeMb * 1024 * 1024;
    if (buffer.length > maxBytes) {
        throw new Error(`File exceeds max upload size (${maxSizeMb} MB)`);
    }
    const allowedTypes = project.assetConfig?.allowedTypes;
    if (!isAllowedMime(file.mimeType, allowedTypes)) {
        throw new Error(`MIME type not allowed: ${file.mimeType}`);
    }

    const assetType = getAssetTypeFromMime(file.mimeType);
    if (!assetType) throw new Error(`Unsupported MIME type: ${file.mimeType}`);

    const adapter = getProjectAdapter(project);
    const id = generateId();
    const now = new Date().toISOString();

    const activeProvider = await getActiveProviderForProject(projectId);
    const isVideoWithProvider = assetType === 'video' && activeProvider;

    if (isVideoWithProvider) {
        const projectVideoConfig = project.videoProviders;
        const keepLocalCopy =
            options?.keepLocalCopy ??
            projectVideoConfig?.keepLocalCopy ??
            getVideoProvidersConfig()?.keepLocalCopy ??
            false;
        const initial: Asset = {
            id,
            projectId,
            filename: safeOriginalName,
            mimeType: file.mimeType,
            size: buffer.length,
            type: 'video',
            status: 'processing',
            adapter: project.assetConfig?.adapter ?? 'local',
            uploadedBy: user.id,
            uploadedByName: user.name ?? user.email,
            createdAt: now,
            updatedAt: now,
            provider: activeProvider.id,
            providerId: '',
            providerStatus: 'uploading',
            providerMetadata: {},
            keepLocalCopy,
            url: ''
        };
        const assets = await loadAssetsIndex(projectId);
        assets.push(initial);
        await saveAssetsIndex(projectId, assets, user);
        triggerEvent('asset:processing', { id, projectId });

        const providerResult = await activeProvider.upload(
            buffer,
            safeOriginalName,
            file.mimeType,
            { passthrough: id }
        );
        initial.providerId = providerResult.providerId;
        initial.providerStatus = providerResult.providerStatus;
        initial.providerMetadata = providerResult.providerMetadata ?? {};
        if (providerResult.duration != null) initial.duration = providerResult.duration;
        if (initial.duration == null) {
            const duration = await detectVideoDuration(buffer);
            if (duration != null) initial.duration = duration;
        }

        if (keepLocalCopy) {
            try {
                const filename = `${id}-${safeOriginalName}`;
                const result = await adapter.upload(projectId, filename, buffer, file.mimeType);
                initial.path = result.path;
                initial.localUrl = result.url;
            } catch (err) {
                try {
                    await activeProvider.delete(providerResult.providerId);
                } catch {
                    // best-effort cleanup
                }
                const list = await loadAssetsIndex(projectId);
                const idx = list.findIndex(a => a.id === id);
                if (idx >= 0) list.splice(idx, 1);
                await saveAssetsIndex(projectId, list, user);
                throw err;
            }
        }

        initial.status = 'ready';
        initial.url = resolveAssetUrl(initial);
        if (options?.title) initial.title = options.title;
        if (options?.alt) initial.alt = options.alt;
        if (options?.credit) initial.credit = options.credit;
        if (options?.folder) initial.folder = options.folder;

        const idx = assets.findIndex(a => a.id === id);
        if (idx >= 0) assets[idx] = { ...initial };
        await saveAssetsIndex(projectId, assets, user);
        triggerEvent('asset:uploaded', { asset: initial });
        try {
            webhookDispatch(
                'asset.created',
                {
                    assetId: initial.id,
                    filename: initial.filename,
                    mimeType: initial.mimeType,
                    updatedBy: user.id
                },
                { projectId, source: 'api' }
            );
        } catch {
            // never fail the operation
        }
        return initial;
    }

    // Image, document, or video without provider
    const initial: Asset = {
        id,
        projectId,
        filename: safeOriginalName,
        mimeType: file.mimeType,
        size: buffer.length,
        type: assetType,
        status: 'processing',
        adapter: project.assetConfig?.adapter ?? 'local',
        uploadedBy: user.id,
        uploadedByName: user.name ?? user.email,
        createdAt: now,
        updatedAt: now,
        url: ''
    };
    const assets = await loadAssetsIndex(projectId);
    assets.push(initial);
    await saveAssetsIndex(projectId, assets);
    triggerEvent('asset:processing', { id, projectId });

    if (assetType === 'image') {
        const definitions = getVariantDefinitions(project);
        const focalPoint = { x: 0.5, y: 0.5 };
        const generated = await generateVariants(buffer, file.mimeType, definitions, focalPoint);
        const variants: ImageVariant[] = [];
        for (const g of generated) {
            const filename =
                g.key === 'original' ? `${id}-${safeOriginalName}` : `${id}.${g.format}`;
            const variantKey = g.key === 'original' ? 'original' : g.key;
            const result = await adapter.upload(
                projectId,
                filename,
                g.buffer,
                file.mimeType,
                variantKey
            );
            if (g.key === 'original') {
                initial.path = result.path;
                initial.localUrl = result.url;
                initial.width = g.width;
                initial.height = g.height;
            }
            variants.push({
                key: g.key,
                url: result.url,
                width: g.width,
                height: g.height,
                size: g.size,
                format: g.format,
                generatedAt: now
            });
        }
        initial.variants = variants;
    } else if (assetType === 'video') {
        const filename = `${id}-${safeOriginalName}`;
        const result = await adapter.upload(projectId, filename, buffer, file.mimeType);
        initial.path = result.path;
        initial.localUrl = result.url;
        const duration = await detectVideoDuration(buffer);
        if (duration != null) initial.duration = duration;
    } else {
        const filename = `${id}-${safeOriginalName}`;
        const result = await adapter.upload(projectId, filename, buffer, file.mimeType);
        initial.path = result.path;
        initial.localUrl = result.url;
    }

    initial.status = 'ready';
    initial.url = resolveAssetUrl(initial);
    if (options?.title) initial.title = options.title;
    if (options?.alt) initial.alt = options.alt;
    if (options?.credit) initial.credit = options.credit;
    if (options?.folder) initial.folder = options.folder;
    if (options?.generationPrompt != null) initial.generationPrompt = options.generationPrompt;
    if (options?.aiProvider != null) initial.aiProvider = options.aiProvider;
    if (options?.aiGenerated != null) initial.aiGenerated = options.aiGenerated;

    const idx = assets.findIndex(a => a.id === id);
    if (idx >= 0) assets[idx] = { ...initial };
    await saveAssetsIndex(projectId, assets, user);
    triggerEvent('asset:uploaded', { asset: initial });
    try {
        webhookDispatch(
            'asset.created',
            {
                assetId: initial.id,
                filename: initial.filename,
                mimeType: initial.mimeType,
                updatedBy: user.id
            },
            { projectId, source: 'api' }
        );
    } catch {
        // never fail the operation
    }
    return initial;
}

/** Verify webhook signature against project-level provider config. */
export async function verifyProviderWebhookSignature(
    providerId: VideoProviderId,
    rawBody: string,
    signature: string
): Promise<boolean> {
    const { verifyProviderWebhookAndGetProjectId } = await import('./providerRegistry.js');
    const result = await verifyProviderWebhookAndGetProjectId(providerId, rawBody, signature);
    return result != null;
}

export async function handleProviderWebhook(
    providerId: VideoProviderId,
    payload: unknown,
    signature: string,
    verified: { projectId: string; secret: string }
): Promise<void> {
    const { projectId, secret } = verified;
    const provider: VideoProvider | null = await getProviderForProject(projectId, providerId);
    if (!provider || !secret) return;
    const result = await provider.handleWebhook(payload, signature, secret);
    if (result == null) return;

    const assets = await loadAssetsIndex(projectId);
    const asset = result.correlationId
        ? assets.find(a => a.id === result.correlationId)
        : assets.find(a => a.providerId === result.providerId);
    if (!asset) return;
    if (result.providerStatus === 'ready' && asset.providerStatus === 'ready') return;
    if (result.correlationId) {
        asset.providerId = result.providerId;
    }
    asset.providerStatus = result.providerStatus;
    Object.assign(asset.providerMetadata ?? {}, result.providerMetadata);
    if (result.duration != null) asset.duration = result.duration;
    asset.updatedAt = new Date().toISOString();
    asset.url = resolveAssetUrl(asset);
    await saveAssetsIndex(projectId, assets);
    triggerEvent('asset:updated', { asset });
    if (result.providerStatus === 'ready') triggerEvent('asset:ready', { asset });
    if (result.providerStatus === 'error')
        triggerEvent('asset:error', {
            id: asset.id,
            projectId,
            error: (result.providerMetadata?.error as string) ?? 'Unknown'
        });
}

export async function migrateProvider(
    user: User,
    options: {
        fromProvider?: VideoProviderId | 'local';
        toProvider: VideoProviderId | 'local';
        projectIds?: string[];
        keepLocalCopy?: boolean;
    }
): Promise<{ processed: number; errors: number; skipped: number }> {
    let processed = 0;
    let errors = 0;
    let skipped = 0;
    const projectIds =
        options.projectIds ?? (await import('../projects.js')).loadProjects().map(p => p.id);

    for (const projectId of projectIds) {
        const project = await getProject(user, projectId);
        const assets = await loadAssetsIndex(projectId);
        const adapter = getProjectAdapter(project);

        for (const asset of assets) {
            if (asset.type !== 'video') continue;
            if (options.fromProvider && options.fromProvider !== 'local') {
                if (asset.provider !== options.fromProvider) continue;
            } else if (options.fromProvider === 'local') {
                if (asset.provider) continue;
            }

            try {
                if (options.toProvider === 'local') {
                    asset.url = asset.localUrl ?? '';
                    asset.provider = undefined;
                    asset.providerId = undefined;
                    asset.providerStatus = undefined;
                    asset.providerMetadata = undefined;
                    asset.keepLocalCopy = undefined;
                } else {
                    if (!asset.path) {
                        console.error(
                            `[moteur] migrate-provider: asset ${asset.id} has no local copy, skipped`
                        );
                        skipped++;
                        continue;
                    }
                    const buffer = await adapter.download(asset.path);
                    const provider = await getProviderForProject(projectId, options.toProvider);
                    if (!provider) {
                        errors++;
                        continue;
                    }
                    const result = await provider.upload(buffer, asset.filename, asset.mimeType);
                    asset.provider = options.toProvider;
                    asset.providerId = result.providerId;
                    asset.providerStatus = result.providerStatus;
                    asset.providerMetadata = result.providerMetadata;
                    if (result.duration != null) asset.duration = result.duration;
                    asset.keepLocalCopy = options.keepLocalCopy ?? false;
                    if (!asset.keepLocalCopy) {
                        asset.path = undefined;
                        asset.localUrl = undefined;
                    }
                    asset.url = resolveAssetUrl(asset);
                }
                asset.updatedAt = new Date().toISOString();
                const list = await loadAssetsIndex(projectId);
                const idx = list.findIndex(a => a.id === asset.id);
                if (idx >= 0) list[idx] = asset;
                await saveAssetsIndex(projectId, list);
                triggerEvent('asset:updated', { asset });
                processed++;
            } catch (err) {
                console.error('[moteur] migrate-provider error', asset.id, err);
                errors++;
            }
        }
    }
    return { processed, errors, skipped };
}

export async function regenerateVariants(
    projectId: string,
    user: User,
    assetIds?: string[]
): Promise<{ processed: number; errors: number }> {
    const project = await getProject(user, projectId);
    const adapter = getProjectAdapter(project);
    const assets = await loadAssetsIndex(projectId);
    const definitions = getVariantDefinitions(project);
    let processed = 0;
    let errors = 0;

    const toProcess = assetIds
        ? assets.filter(a => assetIds.includes(a.id) && a.type === 'image')
        : assets.filter(a => a.type === 'image');

    for (const asset of toProcess) {
        try {
            if (!asset.path) {
                errors++;
                continue;
            }
            const buffer = await adapter.download(asset.path);
            const focalPoint = asset.focalPoint ?? { x: 0.5, y: 0.5 };
            const generated = await generateVariants(
                buffer,
                asset.mimeType,
                definitions,
                focalPoint
            );
            const variants: ImageVariant[] = [];
            const now = new Date().toISOString();
            for (const g of generated) {
                const filename =
                    g.key === 'original'
                        ? `${asset.id}-${asset.filename}`
                        : `${asset.id}.${g.format}`;
                const variantKey = g.key === 'original' ? 'original' : g.key;
                const result = await adapter.upload(
                    projectId,
                    filename,
                    g.buffer,
                    asset.mimeType,
                    variantKey
                );
                variants.push({
                    key: g.key,
                    url: result.url,
                    width: g.width,
                    height: g.height,
                    size: g.size,
                    format: g.format,
                    generatedAt: now
                });
            }
            asset.variants = variants;
            asset.updatedAt = now;
            asset.url = resolveAssetUrl(asset);
            const list = await loadAssetsIndex(projectId);
            const idx = list.findIndex(a => a.id === asset.id);
            if (idx >= 0) list[idx] = asset;
            await saveAssetsIndex(projectId, list);
            triggerEvent('asset:updated', { asset });
            processed++;
        } catch (err) {
            console.error('[moteur] regenerateVariants error', asset.id, err);
            errors++;
        }
    }
    return { processed, errors };
}

export async function listAssets(
    projectId: string,
    options?: { type?: AssetType; folder?: string; search?: string }
): Promise<Asset[]> {
    const assets = await loadAssetsIndex(projectId);
    let out = assets.map(a => ({ ...a, url: resolveAssetUrl(a) }));
    if (options?.type) out = out.filter(a => a.type === options.type);
    if (options?.folder != null) out = out.filter(a => (a.folder ?? '') === options.folder);
    if (options?.search) {
        const q = options.search.toLowerCase();
        out = out.filter(
            a =>
                (a.title ?? '').toLowerCase().includes(q) ||
                (a.filename ?? '').toLowerCase().includes(q) ||
                (a.alt ?? '').toLowerCase().includes(q)
        );
    }
    return out;
}

export async function getAsset(projectId: string, id: string): Promise<Asset | null> {
    const assets = await loadAssetsIndex(projectId);
    const asset = assets.find(a => a.id === id);
    if (!asset) return null;
    return { ...asset, url: resolveAssetUrl(asset) };
}

export async function updateAsset(
    projectId: string,
    user: User,
    id: string,
    patch: {
        title?: string;
        alt?: string;
        caption?: string;
        description?: string;
        credit?: string;
        folder?: string;
        focalPoint?: { x: number; y: number };
    }
): Promise<Asset> {
    await getProject(user, projectId);
    const assets = await loadAssetsIndex(projectId);
    const idx = assets.findIndex(a => a.id === id);
    if (idx < 0) throw new Error(`Asset "${id}" not found`);
    const updated = { ...assets[idx], ...patch, updatedAt: new Date().toISOString() };
    updated.url = resolveAssetUrl(updated);
    assets[idx] = updated;
    await saveAssetsIndex(projectId, assets, user);
    triggerEvent('asset:updated', { asset: updated });
    try {
        webhookDispatch(
            'asset.updated',
            {
                assetId: updated.id,
                filename: updated.filename,
                mimeType: updated.mimeType,
                updatedBy: user.id
            },
            { projectId, source: 'api' }
        );
    } catch {
        // never fail the operation
    }
    return updated;
}

export async function deleteAsset(projectId: string, user: User, id: string): Promise<void> {
    const project = await getProject(user, projectId);
    const assets = await loadAssetsIndex(projectId);
    const idx = assets.findIndex(a => a.id === id);
    if (idx < 0) throw new Error(`Asset "${id}" not found`);
    const asset = assets[idx];
    const adapter = getProjectAdapter(project);

    if (asset.path) {
        try {
            await adapter.delete(asset.path);
        } catch (err) {
            console.error('[moteur] deleteAsset: adapter.delete failed', asset.path, err);
        }
    }
    if (asset.variants) {
        for (const v of asset.variants) {
            if (v.key === 'original') continue;
            const storedPath = `${projectId}/${v.key}/${asset.id}.${v.format}`;
            try {
                await adapter.delete(storedPath);
            } catch {
                // ignore
            }
        }
    }
    if (asset.providerId) {
        const provider = asset.provider ? getProvider(asset.provider) : null;
        if (provider) {
            try {
                await provider.delete(asset.providerId);
            } catch (err) {
                console.error(
                    '[moteur] deleteAsset: provider.delete failed',
                    asset.providerId,
                    err
                );
            }
        }
    }

    assets.splice(idx, 1);
    await saveAssetsIndex(projectId, assets, user);
    triggerEvent('asset:deleted', { id: asset.id });
    try {
        webhookDispatch(
            'asset.deleted',
            {
                assetId: asset.id,
                filename: asset.filename,
                mimeType: asset.mimeType,
                updatedBy: user.id
            },
            { projectId, source: 'api' }
        );
    } catch {
        // never fail the operation
    }
}

export async function moveToFolder(
    projectId: string,
    user: User,
    id: string,
    folder: string
): Promise<Asset> {
    return updateAsset(projectId, user, id, { folder });
}

export async function getAssetConfig(projectId: string, user: User) {
    const project = await getProject(user, projectId);
    const config = project.assetConfig ?? {
        variants: getVariantDefinitions(project),
        maxUploadSizeMb: DEFAULT_MAX_SIZE_MB,
        allowedTypes: undefined,
        adapter: 'local',
        adapterConfig: undefined
    };
    const redacted = { ...config };
    if (redacted.adapterConfig) {
        redacted.adapterConfig = { ...redacted.adapterConfig };
        for (const key of Object.keys(redacted.adapterConfig)) {
            const lower = key.toLowerCase();
            if (
                lower.includes('key') ||
                lower.includes('secret') ||
                lower.includes('password') ||
                lower.includes('token')
            ) {
                redacted.adapterConfig[key] = '***';
            }
        }
    }
    return redacted;
}

export async function updateAssetConfig(
    projectId: string,
    user: User,
    patch: Partial<NonNullable<ProjectSchema['assetConfig']>>
) {
    const project = await getProject(user, projectId);
    if (patch.variants) {
        const keys = new Set<string>();
        for (const v of patch.variants) {
            if (v.key === 'original') throw new Error("Variant key 'original' is reserved");
            if (keys.has(v.key)) throw new Error(`Duplicate variant key: ${v.key}`);
            keys.add(v.key);
        }
    }
    const current: Partial<NonNullable<ProjectSchema['assetConfig']>> = project.assetConfig ?? {};
    const updated: NonNullable<ProjectSchema['assetConfig']> = {
        enabled: patch.enabled ?? current.enabled,
        variants: patch.variants ?? current.variants ?? getVariantDefinitions(project),
        maxUploadSizeMb: patch.maxUploadSizeMb ?? current.maxUploadSizeMb,
        allowedTypes: patch.allowedTypes ?? current.allowedTypes,
        adapter: patch.adapter ?? current.adapter,
        adapterConfig: patch.adapterConfig ?? current.adapterConfig
    };
    const { updateProject } = await import('../projects.js');
    await updateProject(user, projectId, { assetConfig: updated });
    return getAssetConfig(projectId, user);
}
