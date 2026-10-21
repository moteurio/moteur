import type { Asset, AssetText, AssetType, ImageVariant } from '@moteurio/types/Asset.js';
import type { VideoProviderId } from '@moteurio/types/Asset.js';
import { translatorOnly } from '@moteurio/types';
import type { User } from '@moteurio/types/User.js';
import {
    assertCanEdit,
    assertCanWrite,
    contentForbidden,
    translationOnlyChange
} from '../contentAccess.js';
import type { ProjectSchema } from '@moteurio/types/Project.js';
import { getProject } from '../projects.js';
import { getProjectJson, putProjectJson } from '../utils/projectStorage.js';
import { ASSETS_KEY } from '../utils/storageKeys.js';
import { triggerEvent } from '../utils/eventBus.js';
import { getProjectAdapter } from './adapterRegistry.js';
import { staticBaseUrl } from './adapters/LocalAdapter.js';
import type { VideoProvider } from './VideoProvider.js';
import {
    getActiveProviderForProject,
    getProviderForProject,
    getProvider,
    getVideoProvidersConfig
} from './providerRegistry.js';
import { getVariantDefinitions } from './defaultVariants.js';
import { generateVariants, readImageShape } from './imageTransformer.js';
import { detectVideoDuration } from './videoMetadata.js';
import { isAllowedMime, getAssetTypeFromMime, resolveUploadMime } from './allowedTypes.js';
import { dispatch as webhookDispatch } from '../webhooks/webhookService.js';
import { sanitizeUploadFilename } from './safeUploadFilename.js';
import { assertStorageRoom } from '../planLimits.js';

const DEFAULT_MAX_SIZE_MB = 50;

/** Where one asset's on-request sizes are stored (a folder of its own, removed with it). */
export const resizedFolder = (assetId: string) => `r-${assetId}`;

/**
 * The address that serves an image at any size: add `&w=640` (and `&ar=1:1`, `&fmt=avif`).
 * Its `v` changes when the crops change, so caches can keep each answer for good.
 */
export function resizeUrlOf(asset: Asset): string | undefined {
    if (asset.type !== 'image' || !asset.path) return undefined;
    const made = asset.variants?.find(v => v.key !== 'original')?.generatedAt ?? asset.updatedAt;
    const v = Date.parse(made).toString(36);
    return `${staticBaseUrl()}/resize/${encodeURIComponent(asset.projectId)}/${encodeURIComponent(asset.id)}?v=${v}`;
}

/** An asset as read: its URL, and for images the on-request size address. */
function withUrls(asset: Asset): Asset {
    const out: Asset = { ...asset, url: resolveAssetUrl(asset) };
    const resize = resizeUrlOf(asset);
    if (resize) out.resizeUrl = resize;
    return out;
}

/**
 * A variant's URL with its version: rebuilt copies keep their file name, so the version is
 * what tells browsers and caches that the picture changed (and lets them keep it for good).
 */
function versionedUrl(url: string, generatedAt: string): string {
    const v = Date.parse(generatedAt).toString(36);
    const base = url.replace(/([?&])v=[^&]*&?/, '$1').replace(/[?&]$/, '');
    return `${base}${base.includes('?') ? '&' : '?'}v=${v}`;
}

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

/** Bytes a project's files take, as uploaded (the copies made from images aren't counted). */
export async function storageUsed(projectId: string): Promise<number> {
    const assets = await loadAssetsIndex(projectId);
    return assets.reduce((n, a) => n + (Number.isFinite(a.size) ? a.size : 0), 0);
}

async function saveAssetsIndex(projectId: string, assets: Asset[], user?: User): Promise<void> {
    const toStore = assets.map(({ url: _u, resizeUrl: _r, ...a }) => a);
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
    assertCanWrite(user);
    const buffer = file.buffer;
    const safeOriginalName = sanitizeUploadFilename(file.originalName);
    file = { ...file, mimeType: resolveUploadMime(file.mimeType, safeOriginalName) };
    const project = await getProject(user, projectId);
    if (project.assetConfig?.enabled === false) {
        throw new Error('Media is disabled for this project');
    }
    const maxSizeMb = project.assetConfig?.maxUploadSizeMb ?? DEFAULT_MAX_SIZE_MB;
    const maxBytes = maxSizeMb * 1024 * 1024;
    if (buffer.length > maxBytes) {
        throw new Error(`File exceeds max upload size (${maxSizeMb} MB)`);
    }
    assertStorageRoom(projectId, await storageUsed(projectId), buffer.length);
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

    // Image, document, 3D model, or video without provider
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

    let queueCopies = false;
    if (assetType === 'image') {
        // Store the original now; the copies are made after the response (see imageQueue).
        const result = await adapter.upload(
            projectId,
            `${id}-${safeOriginalName}`,
            buffer,
            file.mimeType,
            'original'
        );
        initial.path = result.path;
        initial.localUrl = result.url;
        try {
            const shape = await readImageShape(buffer);
            initial.width = shape.width;
            initial.height = shape.height;
        } catch {
            // Unreadable image: the copies will fail and mark it.
        }
        initial.variants = [
            {
                key: 'original',
                url: result.url,
                width: initial.width ?? 0,
                height: initial.height ?? 0,
                size: buffer.length,
                format: file.mimeType.split('/')[1] ?? '',
                generatedAt: now
            }
        ];
        queueCopies = true;
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

    initial.status = queueCopies ? 'processing' : 'ready';
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
    if (queueCopies) void queueImageCopies(project, id, buffer);
    return withUrls(initial);
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

/**
 * Makes and stores an image's copies (every variant but the original), turned upright, never
 * enlarged and cropped around the focal point. Their URLs carry the time they were made.
 */
async function makeCopies(
    project: ProjectSchema,
    asset: Asset,
    buffer: Buffer
): Promise<{ variants: ImageVariant[]; width: number; height: number }> {
    const adapter = getProjectAdapter(project);
    const now = new Date().toISOString();
    const generated = await generateVariants(
        buffer,
        asset.mimeType,
        getVariantDefinitions(project),
        asset.focalPoint ?? { x: 0.5, y: 0.5 }
    );
    const original = generated.find(g => g.key === 'original');
    if (!original) throw new Error('The image could not be read.');
    const variants: ImageVariant[] = [];
    for (const g of generated) {
        if (g.key === 'original') continue;
        const result = await adapter.upload(
            project.id,
            `${asset.id}.${g.format}`,
            g.buffer,
            `image/${g.format === 'jpg' ? 'jpeg' : g.format}`,
            g.key
        );
        variants.push({
            key: g.key,
            url: versionedUrl(result.url, now),
            width: g.width,
            height: g.height,
            size: g.size,
            format: g.format,
            generatedAt: now
        });
    }
    return { variants, width: original.width, height: original.height };
}

/** Writes a finished (or failed) image back, over whatever was saved meanwhile. */
async function storeCopies(
    projectId: string,
    id: string,
    result: { variants: ImageVariant[]; width: number; height: number } | null
): Promise<Asset | null> {
    const list = await loadAssetsIndex(projectId);
    const idx = list.findIndex(a => a.id === id);
    if (idx < 0) return null; // deleted while its copies were being made
    const current = list[idx];
    const kept = current.variants?.find(v => v.key === 'original');
    const next: Asset = result
        ? {
              ...current,
              width: result.width,
              height: result.height,
              variants: [...(kept ? [kept] : []), ...result.variants],
              status: 'ready',
              updatedAt: new Date().toISOString()
          }
        : { ...current, status: 'error', updatedAt: new Date().toISOString() };
    next.url = resolveAssetUrl(next);
    list[idx] = next;
    await saveAssetsIndex(projectId, list);
    triggerEvent('asset:updated', { asset: next });
    return next;
}

// ── Background copies: uploads answer at once, copies follow, two images at a time ──
const IMAGE_CONCURRENCY = 2;
const imageJobs = new Map<string, Promise<void>>();
const waiting: Array<() => void> = [];
let activeJobs = 0;

async function slot(): Promise<void> {
    if (activeJobs < IMAGE_CONCURRENCY) {
        activeJobs++;
        return;
    }
    await new Promise<void>(resolve => waiting.push(resolve));
}

function release(): void {
    const next = waiting.shift();
    if (next) next();
    else activeJobs--;
}

/**
 * Makes an uploaded image's copies after the response. `buffer` is the original when the
 * upload still holds it; otherwise it is read back from storage.
 */
export function queueImageCopies(
    project: ProjectSchema,
    id: string,
    buffer?: Buffer
): Promise<void> {
    const key = `${project.id}/${id}`;
    const running = imageJobs.get(key);
    if (running) return running;
    const job = (async () => {
        await slot();
        try {
            const asset = (await loadAssetsIndex(project.id)).find(a => a.id === id);
            if (!asset) return;
            let result: Awaited<ReturnType<typeof makeCopies>> | null = null;
            try {
                const source = buffer ?? (await getProjectAdapter(project).download(asset.path!));
                result = await makeCopies(project, asset, source);
            } catch (err) {
                console.error('[moteur] image copies failed', project.id, id, err);
            }
            await storeCopies(project.id, id, result);
        } finally {
            release();
            imageJobs.delete(key);
        }
    })();
    imageJobs.set(key, job);
    return job;
}

/** Resolves once an image's copies are made (at once when nothing is running for it). */
export function whenAssetReady(projectId: string, id: string): Promise<void> {
    return imageJobs.get(`${projectId}/${id}`) ?? Promise.resolve();
}

/**
 * Picks up images left processing by a restart: their originals are stored, only the copies
 * are missing. Call once at startup.
 */
export async function resumeImageCopies(projects: ProjectSchema[]): Promise<number> {
    let queued = 0;
    for (const project of projects) {
        const list = await loadAssetsIndex(project.id).catch((): Asset[] => []);
        for (const a of list)
            if (a.type === 'image' && a.status === 'processing' && a.path) {
                void queueImageCopies(project, a.id);
                queued++;
            }
    }
    return queued;
}

export async function regenerateVariants(
    projectId: string,
    user: User,
    assetIds?: string[]
): Promise<{ processed: number; errors: number }> {
    const project = await getProject(user, projectId);
    const adapter = getProjectAdapter(project);
    const assets = await loadAssetsIndex(projectId);
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
            const stored = await storeCopies(
                projectId,
                asset.id,
                await makeCopies(project, asset, buffer)
            );
            if (stored) processed++;
        } catch (err) {
            console.error('[moteur] regenerateVariants error', asset.id, err);
            errors++;
        }
    }
    return { processed, errors };
}

/** Every string in an asset text, whatever its shape. */
function textValues(value: AssetText | undefined): string[] {
    if (typeof value === 'string') return [value];
    if (value && typeof value === 'object')
        return Object.values(value).filter(v => typeof v === 'string');
    return [];
}

const PATCHABLE = ['title', 'alt', 'caption', 'description', 'credit', 'folder', 'focalPoint'];
const LOCALIZED = ['title', 'alt', 'caption'];

/**
 * Keeps only the metadata a person may edit, in the shapes the engine understands. Texts in
 * several languages drop empty languages; an all-empty map clears the text.
 */
function checkAssetPatch(patch: Record<string, unknown>): Record<string, unknown> {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch))
        throw new Error('Asset changes must be an object.');
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
        if (!PATCHABLE.includes(key)) continue;
        if (LOCALIZED.includes(key)) {
            if (value === null || typeof value === 'string') out[key] = value ?? undefined;
            else if (value && typeof value === 'object' && !Array.isArray(value)) {
                const map: Record<string, string> = {};
                for (const [locale, text] of Object.entries(value)) {
                    if (typeof text !== 'string')
                        throw new Error(`"${key}.${locale}" must be text.`);
                    if (text.trim()) map[locale] = text;
                }
                out[key] = Object.keys(map).length ? map : undefined;
            } else throw new Error(`"${key}" must be text, or text per language.`);
        } else if (key === 'focalPoint') {
            const fp = value as { x?: unknown; y?: unknown } | null;
            if (fp === null) out[key] = undefined;
            else if (
                !fp ||
                typeof fp.x !== 'number' ||
                typeof fp.y !== 'number' ||
                fp.x < 0 ||
                fp.x > 1 ||
                fp.y < 0 ||
                fp.y > 1
            )
                throw new Error('"focalPoint" needs x and y between 0 and 1.');
            else out[key] = { x: fp.x, y: fp.y };
        } else if (value === null || typeof value === 'string') out[key] = value ?? undefined;
        else throw new Error(`"${key}" must be text.`);
    }
    return out;
}

export async function listAssets(
    projectId: string,
    options?: { type?: AssetType; folder?: string; search?: string }
): Promise<Asset[]> {
    const assets = await loadAssetsIndex(projectId);
    let out = assets.map(withUrls);
    if (options?.type) out = out.filter(a => a.type === options.type);
    if (options?.folder != null) out = out.filter(a => (a.folder ?? '') === options.folder);
    if (options?.search) {
        const q = options.search.toLowerCase();
        out = out.filter(a =>
            [
                a.filename,
                ...textValues(a.title),
                ...textValues(a.alt),
                ...textValues(a.caption)
            ].some(s => (s ?? '').toLowerCase().includes(q))
        );
    }
    return out;
}

export async function getAsset(projectId: string, id: string): Promise<Asset | null> {
    const assets = await loadAssetsIndex(projectId);
    const asset = assets.find(a => a.id === id);
    if (!asset) return null;
    return withUrls(asset);
}

export async function updateAsset(
    projectId: string,
    user: User,
    id: string,
    patch: {
        title?: AssetText;
        alt?: AssetText;
        caption?: AssetText;
        description?: string;
        credit?: string;
        folder?: string;
        focalPoint?: { x: number; y: number };
    }
): Promise<Asset> {
    const project = await getProject(user, projectId);
    assertCanEdit(user);
    const changes = checkAssetPatch(patch as Record<string, unknown>);
    const assets = await loadAssetsIndex(projectId);
    const idx = assets.findIndex(a => a.id === id);
    if (idx < 0) throw new Error(`Asset "${id}" not found`);
    if (translatorOnly(user)) {
        const locales = [project.defaultLocale, ...(project.supportedLocales ?? [])].filter(
            Boolean
        );
        const textKeys = ['title', 'alt', 'caption'] as const;
        const before = assets[idx];
        for (const key of Object.keys(changes)) {
            if (!textKeys.includes(key as (typeof textKeys)[number])) {
                throw contentForbidden('A translator can only change other languages.');
            }
        }
        for (const key of textKeys) {
            if (
                changes[key] !== undefined &&
                !translationOnlyChange(before[key], changes[key], locales, project.defaultLocale)
            ) {
                throw contentForbidden('A translator can only change other languages.');
            }
        }
    }
    const before = assets[idx];
    const updated = { ...before, ...changes, updatedAt: new Date().toISOString() } as Asset;
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
    // Crops follow the focal point: remake this picture's copies when it moves.
    const focalMoved =
        'focalPoint' in changes &&
        JSON.stringify(before.focalPoint ?? null) !== JSON.stringify(updated.focalPoint ?? null);
    if (focalMoved && updated.type === 'image' && updated.path) {
        // Sizes made on request were cropped around the old point.
        const project = await getProject(user, projectId);
        await getProjectAdapter(project).deleteFolder?.(projectId, resizedFolder(id));
        await regenerateVariants(projectId, user, [id]);
        return (await getAsset(projectId, id)) ?? withUrls(updated);
    }
    return withUrls(updated);
}

export async function deleteAsset(projectId: string, user: User, id: string): Promise<void> {
    assertCanWrite(user);
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

    try {
        await adapter.deleteFolder?.(projectId, resizedFolder(asset.id));
    } catch (err) {
        console.error('[moteur] deleteAsset: resized copies not removed', asset.id, err);
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
