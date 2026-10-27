import { createHash } from 'crypto';
import type { Asset, AssetText, AssetType, ImageVariant } from '@moteurio/types/Asset.js';
import type { VideoProviderId } from '@moteurio/types/Asset.js';
import { hasRole, inProject, translatorOnly } from '@moteurio/types';
import type { User } from '@moteurio/types/User.js';
import {
    assertCanEdit,
    assertCanWrite,
    contentForbidden,
    translationOnlyChange
} from '../contentAccess.js';
import type { ProjectSchema } from '@moteurio/types/Project.js';
import { getProject, getProjectById } from '../projects.js';
import { getProjectJson, putProjectJson } from '../utils/projectStorage.js';
import { ASSETS_KEY } from '../utils/storageKeys.js';
import { triggerEvent } from '../utils/eventBus.js';
import { getProjectAdapter } from './adapterRegistry.js';
import type { StorageAdapter } from './StorageAdapter.js';
import { staticBaseUrl } from './adapters/LocalAdapter.js';
import type { VideoHostReport, VideoProvider } from './VideoProvider.js';
import {
    getActiveProviderForProject,
    getProviderForProject,
    getVideoProvidersConfig
} from './providerRegistry.js';
import { getVariantDefinitions } from './defaultVariants.js';
import { generateVariants, readImageShape, stripImageMetadata } from './imageTransformer.js';
import { detectVideoDuration } from './videoMetadata.js';
import { isAllowedMime, getAssetTypeFromMime, resolveUploadMime } from './allowedTypes.js';
import { dispatch as webhookDispatch } from '../webhooks/webhookService.js';
import { sanitizeUploadFilename } from './safeUploadFilename.js';
import { ASSET_KINDS, fold, kindOf, textValues } from './assetFacts.js';
import { getAssetIndex } from './assetIndex.js';
import { assertStorageRoom } from '../planLimits.js';

export const DEFAULT_MAX_SIZE_MB = 50;

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

const STATIC_ASSETS = '/static/assets/';
const isLocal = (asset: Asset) => !asset.adapter || asset.adapter === 'local';

/**
 * A local file's address as stored: `/static/assets/…`, without the server, so the data keeps
 * working when the API moves (another host, port or base path). Other storages keep theirs.
 */
function storedUrl(asset: Asset, url: string | undefined): string | undefined {
    if (!url || !isLocal(asset)) return url;
    const at = url.indexOf(STATIC_ASSETS);
    return at < 0 ? url : url.slice(at);
}

/** A local file's address as served now, whether it was stored with a server or without. */
function liveUrl(asset: Asset, url: string | undefined): string | undefined {
    if (!url || !isLocal(asset)) return url;
    const at = url.indexOf(STATIC_ASSETS);
    // staticBaseUrl() ends with `/static`: add what follows it.
    return at < 0 ? url : `${staticBaseUrl()}${url.slice(at + '/static'.length)}`;
}

/** An asset with its local addresses as served now. */
function withLiveUrls(asset: Asset): Asset {
    return {
        ...asset,
        ...(asset.localUrl ? { localUrl: liveUrl(asset, asset.localUrl) } : {}),
        ...(asset.variants
            ? { variants: asset.variants.map(v => ({ ...v, url: liveUrl(asset, v.url) ?? v.url })) }
            : {})
    };
}

/** An asset as read: its URL, and for images the on-request size address. */
function withUrls(stored: Asset): Asset {
    const asset = withLiveUrls(stored);
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
    const toStore = assets.map(({ url: _u, resizeUrl: _r, ...a }) => ({
        ...a,
        ...(a.localUrl ? { localUrl: storedUrl(a as Asset, a.localUrl) } : {}),
        ...(a.variants
            ? {
                  variants: a.variants.map(v => ({
                      ...v,
                      url: storedUrl(a as Asset, v.url) ?? v.url
                  }))
              }
            : {})
    }));
    await putProjectJson(projectId, ASSETS_KEY, toStore);
    triggerEvent('content.saved', {
        projectId,
        paths: [ASSETS_KEY],
        message: `Update assets — ${user?.name ?? user?.id ?? SYSTEM_USER.name}`,
        user: user ?? SYSTEM_USER
    });
}

// ── One change at a time per project, each on the list as it stands then ──
const writing = new Map<string, Promise<unknown>>();

/**
 * Changes a project's asset list. Changes run one at a time per project, each reading the list
 * just before saving it, so an upload, a finished image and an edit never overwrite each other.
 * `change` must stay quick and synchronous: do slow work (storage, providers) before or after.
 * Throwing in it saves nothing; so does a change that leaves the list as it was.
 */
async function changeAssets<T>(
    projectId: string,
    user: User | undefined,
    change: (list: Asset[]) => T
): Promise<T> {
    const previous = writing.get(projectId) ?? Promise.resolve();
    const run = previous.then(async () => {
        const list = await loadAssetsIndex(projectId);
        const was = JSON.stringify(list);
        const out = change(list);
        if (JSON.stringify(list) !== was) await saveAssetsIndex(projectId, list, user);
        return out;
    });
    const settled = run.then(
        () => undefined,
        () => undefined
    );
    writing.set(projectId, settled);
    try {
        return await run;
    } finally {
        if (writing.get(projectId) === settled) writing.delete(projectId);
    }
}

/** Puts `asset` in place of the one with its id (if it is still there). */
const replaceIn = (list: Asset[], asset: Asset) => {
    const idx = list.findIndex(a => a.id === asset.id);
    if (idx >= 0) list[idx] = { ...asset };
};

/** Takes the asset with that id out of the list. */
const removeFrom = (list: Asset[], id: string) => {
    const idx = list.findIndex(a => a.id === id);
    if (idx >= 0) list.splice(idx, 1);
};

/** The fingerprint of a file as uploaded, to recognise the same file uploaded again. */
export const fileHash = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');

/** What every upload must pass: media on, size, room left on the plan, an allowed kind. */
function assertUploadAllowed(
    project: ProjectSchema,
    size: number,
    mimeType: string,
    used: number
): AssetType {
    if (project.assetConfig?.enabled === false) {
        throw new Error('Media is disabled for this project');
    }
    const maxSizeMb = project.assetConfig?.maxUploadSizeMb ?? DEFAULT_MAX_SIZE_MB;
    if (size > maxSizeMb * 1024 * 1024) {
        throw new Error(`File exceeds max upload size (${maxSizeMb} MB)`);
    }
    assertStorageRoom(project.id, used, size);
    if (!isAllowedMime(mimeType, project.assetConfig?.allowedTypes)) {
        throw new Error(`MIME type not allowed: ${mimeType}`);
    }
    const type = getAssetTypeFromMime(mimeType);
    if (!type) throw new Error(`Unsupported MIME type: ${mimeType}`);
    return type;
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

/**
 * Lets plugins act on a new or replaced file (the AI plugin describes images), then reads the
 * asset again for what they changed. Whatever they do, the file is saved: a failing listener is
 * logged, not passed on.
 */
async function afterFile(
    event: 'asset.afterCreate' | 'asset.afterReplace',
    projectId: string,
    user: User,
    asset: Asset,
    uploadAlt?: string
): Promise<Asset> {
    try {
        await triggerEvent(event, { projectId, asset, user, ...(uploadAlt ? { uploadAlt } : {}) });
    } catch (err) {
        console.error(`[assets] ${event} listener failed for ${projectId}/${asset.id}:`, err);
    }
    return (await getAsset(projectId, asset.id)) ?? asset;
}

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
    let buffer = file.buffer;
    const safeOriginalName = sanitizeUploadFilename(file.originalName);
    file = { ...file, mimeType: resolveUploadMime(file.mimeType, safeOriginalName) };
    const project = await getProject(user, projectId);
    const assetType = assertUploadAllowed(
        project,
        buffer.length,
        file.mimeType,
        await storageUsed(projectId)
    );
    const hash = fileHash(buffer);
    // Photos carry where they were taken: keep the picture, not that.
    if (assetType === 'image') {
        await readImageShape(buffer);
        buffer = await stripImageMetadata(buffer, file.mimeType);
    }

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
        // Stored here first, so the upload answers at once and nothing is lost if the host
        // refuses it or the server restarts: the copy goes when the host has the video ready
        // (unless it is kept).
        const stored = await adapter.upload(
            projectId,
            `${id}-${safeOriginalName}`,
            buffer,
            file.mimeType
        );
        const initial: Asset = {
            id,
            projectId,
            filename: safeOriginalName,
            mimeType: file.mimeType,
            size: buffer.length,
            type: 'video',
            status: 'ready',
            adapter: project.assetConfig?.adapter ?? 'local',
            path: stored.path,
            localUrl: stored.url,
            uploadedBy: user.id,
            uploadedByName: user.name ?? user.email,
            createdAt: now,
            updatedAt: now,
            hash,
            provider: activeProvider.id,
            providerId: '',
            providerStatus: 'uploading',
            providerMetadata: {},
            keepLocalCopy,
            url: ''
        };
        const duration = await detectVideoDuration(buffer);
        if (duration != null) initial.duration = duration;
        if (options?.title) initial.title = options.title;
        if (options?.alt) initial.alt = options.alt;
        if (options?.credit) initial.credit = options.credit;
        if (options?.folder) initial.folder = options.folder;
        initial.url = resolveAssetUrl(initial);

        await changeAssets(projectId, user, list => void list.push({ ...initial }));
        triggerEvent('asset:uploaded', { asset: initial });
        try {
            await webhookDispatch(
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
        void queueVideoUpload(project, id, buffer);
        return afterFile('asset.afterCreate', projectId, user, withUrls(initial), options?.alt);
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
        hash,
        uploadedBy: user.id,
        uploadedByName: user.name ?? user.email,
        createdAt: now,
        updatedAt: now,
        url: ''
    };
    await changeAssets(projectId, user, list => void list.push({ ...initial }));
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

    await changeAssets(projectId, user, list => replaceIn(list, initial));
    triggerEvent('asset:uploaded', { asset: initial });
    try {
        await webhookDispatch(
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
    return afterFile('asset.afterCreate', projectId, user, withUrls(initial), options?.alt);
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

    await applyHostReport(projectId, result);
}

// ── Videos at a host (Mux, Vimeo…): sent after the upload answers, then watched ──

const videoJobs = new Map<string, Promise<void>>();
/** Videos sent to hosts at once: a move of hundreds goes two by two. */
const VIDEO_CONCURRENCY = 2;
let videosSending = 0;
const videosWaiting: (() => void)[] = [];
async function videoSlot(): Promise<void> {
    if (videosSending < VIDEO_CONCURRENCY) {
        videosSending++;
        return;
    }
    await new Promise<void>(resolve => videosWaiting.push(resolve));
}
function videoSlotDone(): void {
    const next = videosWaiting.shift();
    if (next) next();
    else videosSending--;
}
const watched = new Set<string>();
/** How long to keep asking a host about one video before leaving it to webhooks. */
const WATCH_FOR_MS = 6 * 60 * 60 * 1000;
const isSettled = (status: string | undefined) => status === 'ready' || status === 'error';

const pause = (ms: number) =>
    new Promise<void>(resolve => {
        const timer = setTimeout(resolve, ms);
        timer.unref?.();
    });

/**
 * Records what a host says about a video: from a webhook, an upload or a status check. The
 * video is found by `correlationId` (our id, sent along with the upload), else by its id at the
 * host. Once ready, the copy kept here is deleted unless the project keeps copies.
 */
async function applyHostReport(projectId: string, report: VideoHostReport): Promise<Asset | null> {
    let dropPath: string | undefined;
    let leaving: Asset['previousHost'];
    const asset = await changeAssets(projectId, undefined, list => {
        const found = report.correlationId
            ? list.find(a => a.id === report.correlationId)
            : list.find(a => a.providerId === report.providerId);
        if (!found) return null;
        if (report.providerStatus === 'ready' && found.providerStatus === 'ready') return null;
        if (report.providerId) found.providerId = report.providerId;
        found.providerStatus = report.providerStatus;
        const metadata = { ...(found.providerMetadata ?? {}), ...report.providerMetadata };
        if (report.providerStatus !== 'error') delete metadata.error;
        found.providerMetadata = metadata;
        if (report.duration != null) found.duration = report.duration;
        if (report.providerStatus === 'ready' && !found.keepLocalCopy && found.path) {
            dropPath = found.path;
            delete found.path;
            delete found.localUrl;
        }
        // Moved here from another host: done, so that one can let it go.
        if (report.providerStatus === 'ready' && found.previousHost) {
            leaving = found.previousHost;
            delete found.previousHost;
        }
        found.updatedAt = new Date().toISOString();
        found.url = resolveAssetUrl(found);
        return { ...found };
    });
    if (!asset) return null;
    if (dropPath) {
        try {
            const project = await getProjectById(projectId);
            if (project) await getProjectAdapter(project).delete(dropPath);
        } catch (err) {
            console.error('[moteur] video: the copy here was not deleted', dropPath, err);
        }
    }
    if (leaving?.remove) await removeFromHost(projectId, leaving);
    triggerEvent('asset:updated', { asset });
    if (report.providerStatus === 'ready') triggerEvent('asset:ready', { asset });
    if (report.providerStatus === 'error')
        triggerEvent('asset:error', {
            id: asset.id,
            projectId,
            error: (report.providerMetadata?.error as string) ?? 'Unknown'
        });
    return asset;
}

/**
 * Sends a stored video to its host, after the upload has answered. A refusal is recorded on
 * the video (`providerStatus: 'error'`, the reason in `providerMetadata.error`); the copy here
 * stays, so `retryVideoUpload` can send it again.
 */
export function queueVideoUpload(
    project: ProjectSchema,
    id: string,
    buffer?: Buffer
): Promise<void> {
    const key = `${project.id}/${id}`;
    const running = videoJobs.get(key);
    if (running) return running;
    const job = (async () => {
        await videoSlot();
        try {
            await sendVideo(project, id, buffer);
        } finally {
            videoSlotDone();
        }
    })().finally(() => videoJobs.delete(key));
    videoJobs.set(key, job);
    return job;
}

async function sendVideo(project: ProjectSchema, id: string, buffer?: Buffer): Promise<void> {
    {
        const asset = (await loadAssetsIndex(project.id)).find(a => a.id === id);
        if (!asset?.provider || !asset.path) return;
        let report: VideoHostReport;
        try {
            const provider = await getProviderForProject(project.id, asset.provider);
            if (!provider)
                throw new Error(`The video host "${asset.provider}" is not set up any more.`);
            const source = buffer ?? (await getProjectAdapter(project).download(asset.path));
            const result = await provider.upload(source, asset.filename, asset.mimeType, {
                passthrough: id
            });
            report = { ...result, providerMetadata: result.providerMetadata ?? {} };
        } catch (err) {
            console.error('[moteur] video upload to the host failed', project.id, id, err);
            report = {
                providerId: asset.providerId ?? '',
                providerStatus: 'error',
                providerMetadata: {
                    error: err instanceof Error && err.message ? err.message : 'Upload failed'
                }
            };
        }
        await applyHostReport(project.id, { ...report, correlationId: id });
        if (!isSettled(report.providerStatus)) void watchVideo(project.id, id);
    }
}

/** Resolves once a video's upload to its host is done (at once when none is running). */
export function whenVideoSent(projectId: string, id: string): Promise<void> {
    return videoJobs.get(`${projectId}/${id}`) ?? Promise.resolve();
}

/** Asks the host where one video stands, and records it. Null when the host can't say. */
async function askHost(projectId: string, id: string): Promise<Asset | null> {
    const asset = (await loadAssetsIndex(projectId)).find(a => a.id === id && !a.deletedAt);
    if (!asset?.provider || !asset.providerId) return null;
    const provider = await getProviderForProject(projectId, asset.provider);
    if (!provider?.getStatus) return null;
    const report = await provider.getStatus(asset.providerId);
    if (!report) return null;
    return applyHostReport(projectId, { ...report, correlationId: id });
}

/**
 * Keeps asking the host about a video until it is ready or failed: every 5 seconds at first,
 * then up to every minute, for six hours. Webhooks still work alongside; hosts that can't be
 * asked (no `getStatus`) are left to them.
 */
async function watchVideo(projectId: string, id: string): Promise<void> {
    const key = `${projectId}/${id}`;
    if (watched.has(key)) return;
    watched.add(key);
    try {
        const until = Date.now() + WATCH_FOR_MS;
        for (let wait = 5000; Date.now() < until; wait = Math.min(wait * 2, 60_000)) {
            await pause(wait);
            const asset = (await loadAssetsIndex(projectId)).find(a => a.id === id);
            if (!asset || asset.deletedAt || isSettled(asset.providerStatus)) return;
            try {
                const provider = asset.provider
                    ? await getProviderForProject(projectId, asset.provider)
                    : null;
                if (!provider?.getStatus) return;
                const now = await askHost(projectId, id);
                if (now && isSettled(now.providerStatus)) return;
            } catch (err) {
                console.error('[moteur] video status check failed', projectId, id, err);
            }
        }
    } finally {
        watched.delete(key);
    }
}

/** Asks the host now where a video stands ("Check now"); the video as it is after that. */
export async function checkVideoStatus(projectId: string, user: User, id: string): Promise<Asset> {
    await getProject(user, projectId);
    const current = await getAsset(projectId, id);
    if (!current) throw new Error(`Asset "${id}" not found`);
    if (!current.provider)
        throw Object.assign(new Error('This video is not at a video host.'), { statusCode: 400 });
    await askHost(projectId, id);
    return (await getAsset(projectId, id)) ?? current;
}

/** Sends a video the host refused once more, from the copy kept here. */
export async function retryVideoUpload(projectId: string, user: User, id: string): Promise<Asset> {
    assertCanWrite(user);
    const project = await getProject(user, projectId);
    const asset = await changeAssets(projectId, user, list => {
        const found = list.find(a => a.id === id && !a.deletedAt);
        if (!found) throw new Error(`Asset "${id}" not found`);
        if (!found.provider || found.providerStatus !== 'error')
            throw Object.assign(new Error('Only a video the host refused can be sent again.'), {
                statusCode: 409
            });
        if (!found.path)
            throw Object.assign(
                new Error('The copy of this video here is gone: upload it again.'),
                {
                    statusCode: 409
                }
            );
        // A file the host's processing failed on: start from a new upload there.
        found.providerId = '';
        found.providerStatus = 'uploading';
        found.providerMetadata = {};
        found.updatedAt = new Date().toISOString();
        return { ...found };
    });
    void queueVideoUpload(project, id);
    return withUrls(asset);
}

/** Deletes a video at a host it has left (best effort: it may be gone already). */
async function removeFromHost(
    projectId: string,
    at: { provider: VideoProviderId; providerId: string }
): Promise<void> {
    try {
        const provider = await getProviderForProject(projectId, at.provider);
        if (!provider) throw new Error(`no keys for "${at.provider}"`);
        await provider.delete(at.providerId);
    } catch (err) {
        console.error('[moteur] video: not deleted at its old host', at, err);
    }
}

/** Where a video is: a host, or this server. */
export type VideoHome = VideoProviderId | 'local';

/**
 * Moves a project's videos to where new ones go: its video host, or this server when it has
 * none. Admins. Each video is sent from the copy kept here, in the background, two at a time;
 * it keeps playing from its old host (or here) until the new one has it ready. Videos with no
 * copy here stay where they are (still playable: the old host's keys are kept). With
 * `removeFromOld`, each is deleted at its old host once ready at the new one.
 */
export async function moveVideosToHost(
    projectId: string,
    user: User,
    options: { from?: VideoHome; removeFromOld?: boolean } = {}
): Promise<{ to: VideoHome; moving: number; staying: number }> {
    if (!hasRole(user, 'admin')) throw contentForbidden('Only an admin can move videos.');
    const project = await getProject(user, projectId);
    const to: VideoHome = project.videoProviders?.active ?? 'local';
    if (to !== 'local' && !(await getProviderForProject(projectId, to)))
        throw Object.assign(new Error(`The video host "${to}" is not available.`), {
            statusCode: 400,
            code: 'video_host'
        });
    const keepLocalCopy = project.videoProviders?.keepLocalCopy ?? false;
    const { moving, staying, sending, removing } = await changeAssets(projectId, user, list => {
        const now = new Date().toISOString();
        const out = {
            moving: 0,
            staying: 0,
            sending: [] as string[],
            removing: [] as { provider: VideoProviderId; providerId: string }[]
        };
        for (const a of list) {
            if (a.type !== 'video' || a.deletedAt) continue;
            const at: VideoHome = a.provider ?? 'local';
            if (at === to || (options.from && at !== options.from)) continue;
            if (!a.path) {
                out.staying++;
                continue;
            }
            const leaving =
                a.provider && a.providerId && a.providerStatus !== 'error'
                    ? { provider: a.provider, providerId: a.providerId }
                    : (a.previousHost ?? undefined);
            delete a.previousHost;
            if (to === 'local') {
                delete a.provider;
                delete a.providerId;
                delete a.providerStatus;
                delete a.providerMetadata;
                delete a.keepLocalCopy;
                if (leaving && options.removeFromOld) out.removing.push(leaving);
            } else {
                a.provider = to;
                a.providerId = '';
                a.providerStatus = 'uploading';
                a.providerMetadata = {};
                a.keepLocalCopy = keepLocalCopy;
                if (leaving)
                    a.previousHost = { ...leaving, remove: Boolean(options.removeFromOld) };
                out.sending.push(a.id);
            }
            a.updatedAt = now;
            a.url = resolveAssetUrl(a);
            out.moving++;
        }
        return out;
    });
    for (const id of sending) void queueVideoUpload(project, id);
    for (const at of removing) void removeFromHost(projectId, at);
    return { to, moving, staying };
}

/**
 * Picks up videos left between steps by a restart: sent to the host again when the upload had
 * not finished, watched when the host was still processing. Call once at startup.
 */
export async function resumeVideoUploads(projects: ProjectSchema[]): Promise<number> {
    let resumed = 0;
    for (const project of projects) {
        const list = await loadAssetsIndex(project.id).catch((): Asset[] => []);
        for (const a of list) {
            if (a.type !== 'video' || !a.provider || a.deletedAt) continue;
            if (a.providerStatus === 'uploading' && a.path) {
                void queueVideoUpload(project, a.id);
                resumed++;
            } else if (a.providerStatus === 'processing') {
                void watchVideo(project.id, a.id);
                resumed++;
            }
        }
    }
    return resumed;
}

/**
 * The old instance-wide move (POST /studio/assets/migrate-provider), now one project at a time
 * on top of `moveVideosToHost`: `projectIds` is required, the person must be an admin of each,
 * and `toProvider` must be where that project's new videos go (Setup › Media). Kept for
 * scripts; the Studio uses `moveVideosToHost`.
 */
export async function migrateProvider(
    user: User,
    options: {
        fromProvider?: VideoProviderId | 'local';
        toProvider: VideoProviderId | 'local';
        projectIds?: string[];
        removeFromOld?: boolean;
    }
): Promise<{ processed: number; errors: number; skipped: number }> {
    if (!Array.isArray(options.projectIds) || !options.projectIds.length)
        throw Object.assign(new Error('Name the projects to move (projectIds).'), {
            statusCode: 400
        });
    let processed = 0;
    let errors = 0;
    let skipped = 0;
    for (const projectId of options.projectIds) {
        try {
            const project = await getProject(user, projectId);
            const there = inProject(user, project);
            if ((project.videoProviders?.active ?? 'local') !== options.toProvider)
                throw new Error(
                    `${projectId}: new videos go to "${project.videoProviders?.active ?? 'local'}", not "${options.toProvider}"; change it in Setup › Media first`
                );
            const result = await moveVideosToHost(projectId, there, {
                from: options.fromProvider,
                removeFromOld: options.removeFromOld
            });
            processed += result.moving;
            skipped += result.staying;
        } catch (err) {
            console.error('[moteur] migrate-provider', projectId, err);
            errors++;
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
        asset.focalPoint ?? { x: 0.5, y: 0.5 },
        project.id
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
    const next = await changeAssets(projectId, undefined, list => {
        const idx = list.findIndex(a => a.id === id);
        if (idx < 0) return null; // deleted while its copies were being made
        const current = list[idx];
        const kept = current.variants?.find(v => v.key === 'original');
        const made: Asset = result
            ? {
                  ...current,
                  width: result.width,
                  height: result.height,
                  variants: [...(kept ? [kept] : []), ...result.variants],
                  status: 'ready',
                  updatedAt: new Date().toISOString()
              }
            : { ...current, status: 'error', updatedAt: new Date().toISOString() };
        made.url = resolveAssetUrl(made);
        list[idx] = made;
        return made;
    });
    if (next) triggerEvent('asset:updated', { asset: next });
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

/**
 * Same as regenerateVariants, but answers at once: the images are remade in the background,
 * two at a time, each one's copies replaced as it is done.
 */
export async function queueRegenerateVariants(
    projectId: string,
    user: User,
    assetIds?: string[]
): Promise<{ queued: number }> {
    const project = await getProject(user, projectId);
    const images = (await loadAssetsIndex(projectId)).filter(
        a => a.type === 'image' && a.path && (!assetIds || assetIds.includes(a.id))
    );
    for (const asset of images) void queueImageCopies(project, asset.id);
    return { queued: images.length };
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
    options?: {
        type?: AssetType;
        folder?: string;
        search?: string;
        /** The same file, by fingerprint (see `fileHash`); assets in the bin are included. */
        hash?: string;
        includeBinned?: boolean;
    }
): Promise<Asset[]> {
    // The same file again: one lookup in the index rather than the whole list.
    if (options?.hash && !options.type && options.folder == null && !options.search) {
        const index = await getAssetIndex();
        if (index) return (await index.byHash(projectId, options.hash)).map(withUrls);
    }
    const assets = (await loadAssetsIndex(projectId)).filter(
        a => options?.includeBinned || options?.hash || !a.deletedAt
    );
    let out = assets.map(withUrls);
    if (options?.hash) out = out.filter(a => a.hash === options.hash);
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

/** The library's tabs: a kind of file, or `unused` for files no entry or page uses. */
export type AssetKindFilter = AssetType | 'unused';

/** What the library shows overall: how many files of each kind, and the folders in use. */
export type AssetFacets = {
    total: number;
    kinds: Record<AssetKindFilter, number>;
    folders: string[];
};

export type AssetPage = {
    assets: Asset[];
    /** Files matching the filters, on every page. */
    total: number;
    offset: number;
    limit: number;
    /** On request (the Studio asks on the first page): the counts for the tabs, and folders. */
    facets?: AssetFacets;
};

/** Most files one page may hold. */
export const MAX_ASSET_PAGE = 500;

/**
 * One page of the library, newest first: by kind (or unused), folder (`''` for files in none)
 * and words found in the name, title, alt text or caption, in any language. Files in the bin
 * are left out. Working out what is unused reads every entry and page, so it is only done for
 * the `unused` tab and for facets.
 */
export async function listAssetPage(
    projectId: string,
    user: User,
    options: {
        kind?: AssetKindFilter;
        folder?: string;
        search?: string;
        limit?: number;
        offset?: number;
        facets?: boolean;
    } = {}
): Promise<AssetPage> {
    await getProject(user, projectId);
    const limit = Math.min(MAX_ASSET_PAGE, Math.max(1, Math.floor(options.limit ?? 120)));
    const offset = Math.max(0, Math.floor(options.offset ?? 0));
    const used =
        options.kind === 'unused' || options.facets
            ? new Set((await (await import('./assetUsage.js')).assetUsage(user, projectId)).keys())
            : undefined;

    const index = await getAssetIndex();
    if (index) {
        const page = await index.page(projectId, { ...options, used, limit, offset });
        return {
            assets: page.assets.map(withUrls),
            total: page.total,
            offset,
            limit,
            ...(page.facets && { facets: page.facets as AssetFacets })
        };
    }

    // Without the index (MOTEUR_CONTENT_INDEX=files): the whole file, filtered here.
    const library = (await loadAssetsIndex(projectId)).filter(a => !a.deletedAt);

    const words = fold(options.search?.trim() ?? '');
    const matching = library
        .filter(a => {
            if (options.kind === 'unused') {
                if (used!.has(a.id)) return false;
            } else if (options.kind && kindOf(a) !== options.kind) return false;
            if (options.folder != null && (a.folder ?? '') !== options.folder) return false;
            if (!words) return true;
            return [
                a.filename,
                ...textValues(a.title),
                ...textValues(a.alt),
                ...textValues(a.caption)
            ].some(s => fold(s ?? '').includes(words));
        })
        .sort(
            (a, b) =>
                (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || a.id.localeCompare(b.id)
        );

    let facets: AssetFacets | undefined;
    if (options.facets) {
        const kinds = Object.fromEntries([...ASSET_KINDS, 'unused'].map(k => [k, 0])) as Record<
            AssetKindFilter,
            number
        >;
        const folders = new Set<string>();
        for (const a of library) {
            kinds[kindOf(a)]++;
            if (!used!.has(a.id)) kinds.unused++;
            if (a.folder) folders.add(a.folder);
        }
        facets = { total: library.length, kinds, folders: [...folders].sort() };
    }
    return {
        assets: matching.slice(offset, offset + limit).map(withUrls),
        total: matching.length,
        offset,
        limit,
        ...(facets && { facets })
    };
}

/** An asset by id; one in the bin reads as missing, as it does in content. */
export async function getAsset(projectId: string, id: string): Promise<Asset | null> {
    const assets = await loadAssetsIndex(projectId);
    const asset = assets.find(a => a.id === id && !a.deletedAt);
    if (!asset) return null;
    return withUrls(asset);
}

/** The metadata a person may change on an asset; `null` clears a value. */
export type AssetPatch = {
    title?: AssetText | null;
    alt?: AssetText | null;
    caption?: AssetText | null;
    description?: string | null;
    credit?: string | null;
    folder?: string | null;
    focalPoint?: { x: number; y: number } | null;
};

/** How many assets one batch may change. */
export const MAX_ASSET_BATCH = 500;

/** The ids of a batch: a non-empty list of strings, not too long, each once. */
function batchIds(ids: unknown): string[] {
    if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string' || !id))
        throw Object.assign(new Error('Name the assets: a list of ids.'), { statusCode: 400 });
    if (ids.length > MAX_ASSET_BATCH)
        throw Object.assign(new Error(`At most ${MAX_ASSET_BATCH} assets at a time.`), {
            statusCode: 400
        });
    return [...new Set(ids as string[])];
}

async function notifyUpdated(projectId: string, user: User, asset: Asset): Promise<void> {
    triggerEvent('asset:updated', { asset });
    try {
        await webhookDispatch(
            'asset.updated',
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

/**
 * Changes the metadata of several assets in one save (one line in the project's history): alt
 * texts written for a whole folder, a credit for a shoot. All or nothing: an asset missing or in
 * the bin, or a change a translator may not make, saves none of them.
 */
export async function updateAssets(
    projectId: string,
    user: User,
    changes: { id: string; patch: AssetPatch }[]
): Promise<Asset[]> {
    const project = await getProject(user, projectId);
    assertCanEdit(user);
    batchIds(Array.isArray(changes) ? changes.map(c => c?.id) : changes);
    const checked = changes.map(c => ({
        id: c.id,
        changes: checkAssetPatch(c.patch as Record<string, unknown>)
    }));
    const locales = [project.defaultLocale, ...(project.supportedLocales ?? [])].filter(Boolean);
    const results = await changeAssets(projectId, user, assets =>
        checked.map(({ id, changes }) => {
            const idx = assets.findIndex(a => a.id === id && !a.deletedAt);
            if (idx < 0) throw new Error(`Asset "${id}" not found`);
            const before = assets[idx];
            if (translatorOnly(user)) {
                const textKeys = ['title', 'alt', 'caption'] as const;
                for (const key of Object.keys(changes)) {
                    if (!textKeys.includes(key as (typeof textKeys)[number])) {
                        throw contentForbidden('A translator can only change other languages.');
                    }
                }
                for (const key of textKeys) {
                    if (
                        changes[key] !== undefined &&
                        !translationOnlyChange(
                            before[key],
                            changes[key],
                            locales,
                            project.defaultLocale
                        )
                    ) {
                        throw contentForbidden('A translator can only change other languages.');
                    }
                }
            }
            const updated = {
                ...before,
                ...changes,
                updatedAt: new Date().toISOString()
            } as Asset;
            updated.url = resolveAssetUrl(updated);
            assets[idx] = updated;
            return { before, updated };
        })
    );
    for (const { updated } of results) await notifyUpdated(projectId, user, updated);

    // Crops follow the focal point: remake the copies of pictures whose point moved.
    const refocused = results
        .filter(
            ({ before, updated }) =>
                updated.type === 'image' &&
                updated.path &&
                JSON.stringify(before.focalPoint ?? null) !==
                    JSON.stringify(updated.focalPoint ?? null)
        )
        .map(({ updated }) => updated.id);
    if (refocused.length) {
        // Sizes made on request were cropped around the old point.
        const adapter = getProjectAdapter(project);
        for (const id of refocused) await adapter.deleteFolder?.(projectId, resizedFolder(id));
        await regenerateVariants(projectId, user, refocused);
        const fresh = new Map((await loadAssetsIndex(projectId)).map(a => [a.id, a]));
        return results.map(({ updated }) => withUrls(fresh.get(updated.id) ?? updated));
    }
    // The same asset named twice: its last state.
    const last = new Map(results.map(({ updated }) => [updated.id, updated]));
    return [...last.values()].map(withUrls);
}

export async function updateAsset(
    projectId: string,
    user: User,
    id: string,
    patch: AssetPatch
): Promise<Asset> {
    const [updated] = await updateAssets(projectId, user, [{ id, patch }]);
    return updated;
}

/**
 * Puts assets in the bin, in one save. They disappear from the library and from content (a field
 * using one reads as empty) and can be restored; their files stay until the bin is emptied. The
 * Studio warns first when content uses them. All or nothing: one missing stops the lot.
 */
export async function binAssets(projectId: string, user: User, ids: string[]): Promise<Asset[]> {
    assertCanWrite(user);
    await getProject(user, projectId);
    const wanted = batchIds(ids);
    const binned = await changeAssets(projectId, user, list => {
        const now = new Date().toISOString();
        return wanted.map(id => {
            const found = list.find(a => a.id === id && !a.deletedAt);
            if (!found) throw new Error(`Asset "${id}" not found`);
            found.deletedAt = now;
            found.deletedBy = user.id;
            found.deletedByName = user.name ?? user.email;
            return { ...found };
        });
    });
    for (const asset of binned) {
        triggerEvent('asset:deleted', { id: asset.id });
        try {
            await webhookDispatch(
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
    return binned.map(withUrls);
}

/** Puts one asset in the bin (see `binAssets`). */
export async function deleteAsset(projectId: string, user: User, id: string): Promise<void> {
    await binAssets(projectId, user, [id]);
}

/**
 * Puts a new file in an asset, keeping its id, so everything using it shows the new file: its
 * title, alt text, credit, folder and focal point stay. It must be the same kind (a picture for
 * a picture). An image's copies are made again and its on-request sizes cleared.
 */
export async function replaceAssetFile(
    projectId: string,
    user: User,
    id: string,
    file: UploadFile
): Promise<Asset> {
    assertCanWrite(user);
    const project = await getProject(user, projectId);
    const current = (await loadAssetsIndex(projectId)).find(a => a.id === id && !a.deletedAt);
    if (!current) throw new Error(`Asset "${id}" not found`);
    if (current.provider) {
        throw new Error(
            'A video kept at a video host can’t be replaced yet: upload the new one instead.'
        );
    }
    const safeName = sanitizeUploadFilename(file.originalName);
    const mimeType = resolveUploadMime(file.mimeType, safeName);
    const type = assertUploadAllowed(
        project,
        file.buffer.length,
        mimeType,
        // The file it replaces leaves room for it.
        (await storageUsed(projectId)) - (current.size ?? 0)
    );
    if (type !== current.type) {
        throw new Error(
            `This ${current.type} can only be replaced by another ${current.type}, not a ${type}.`
        );
    }
    const hash = fileHash(file.buffer);
    if (type === 'image') await readImageShape(file.buffer);
    const buffer = type === 'image' ? await stripImageMetadata(file.buffer, mimeType) : file.buffer;
    const adapter = getProjectAdapter(project);
    // A new name each time: caches that kept the old file can't serve it for the new one.
    const stored = await adapter.upload(
        projectId,
        `${id}-${Date.now().toString(36)}-${safeName}`,
        buffer,
        mimeType,
        'original'
    );
    const now = new Date().toISOString();
    const shape = type === 'image' ? await readImageShape(buffer).catch(() => null) : null;
    const duration = type === 'video' ? await detectVideoDuration(buffer) : null;

    const updated = await changeAssets(projectId, user, list => {
        const a = list.find(x => x.id === id && !x.deletedAt);
        if (!a) throw new Error(`Asset "${id}" not found`);
        Object.assign(a, {
            filename: safeName,
            mimeType,
            size: buffer.length,
            hash,
            path: stored.path,
            localUrl: stored.url,
            updatedAt: now
        });
        if (type === 'image') {
            a.width = shape?.width;
            a.height = shape?.height;
            a.variants = [
                {
                    key: 'original',
                    url: stored.url,
                    width: shape?.width ?? 0,
                    height: shape?.height ?? 0,
                    size: buffer.length,
                    format: mimeType.split('/')[1] ?? '',
                    generatedAt: now
                }
            ];
            a.status = 'processing';
        }
        if (duration != null) a.duration = duration;
        a.url = resolveAssetUrl(a);
        return { ...a };
    });

    // The old file and everything made from it.
    if (current.path && current.path !== stored.path) {
        await adapter.delete(current.path).catch(err => {
            console.error('[moteur] replaceAssetFile: old file not removed', current.path, err);
        });
    }
    for (const v of current.variants ?? []) {
        if (v.key === 'original') continue;
        await adapter.delete(`${projectId}/${v.key}/${id}.${v.format}`).catch(() => {});
    }
    await adapter.deleteFolder?.(projectId, resizedFolder(id))?.catch(() => {});
    if (type === 'image') void queueImageCopies(project, id, buffer);

    triggerEvent('asset:updated', { asset: updated });
    try {
        await webhookDispatch(
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
    return afterFile('asset.afterReplace', projectId, user, withUrls(updated));
}

/** What is in the bin, most recently binned first. */
export async function listBinnedAssets(projectId: string, user: User): Promise<Asset[]> {
    await getProject(user, projectId);
    return (await loadAssetsIndex(projectId))
        .filter(a => a.deletedAt)
        .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''))
        .map(withUrls);
}

/** Takes assets out of the bin, in one save: back in the library, and in content wherever used. */
export async function restoreAssets(
    projectId: string,
    user: User,
    ids: string[]
): Promise<Asset[]> {
    assertCanWrite(user);
    await getProject(user, projectId);
    const wanted = batchIds(ids);
    const restored = await changeAssets(projectId, user, list => {
        const now = new Date().toISOString();
        return wanted.map(id => {
            const found = list.find(a => a.id === id && a.deletedAt);
            if (!found) throw new Error(`Asset "${id}" not found in the bin`);
            delete found.deletedAt;
            delete found.deletedBy;
            delete found.deletedByName;
            found.updatedAt = now;
            return { ...found };
        });
    });
    for (const asset of restored) {
        triggerEvent('asset:updated', { asset });
        try {
            await webhookDispatch(
                'asset.created',
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
    return restored.map(withUrls);
}

/** Takes one asset out of the bin (see `restoreAssets`). */
export async function restoreAsset(projectId: string, user: User, id: string): Promise<Asset> {
    const [asset] = await restoreAssets(projectId, user, [id]);
    return asset;
}

function assertCanEmptyBin(user: User): void {
    if (!hasRole(user, 'admin')) throw contentForbidden('Only an admin can delete files for good.');
}

/** Deletes an asset in the bin for good: its files, its copies, its video at the host. Admins only. */
export async function deleteAssetForever(projectId: string, user: User, id: string): Promise<void> {
    assertCanEmptyBin(user);
    const project = await getProject(user, projectId);
    const asset = (await loadAssetsIndex(projectId)).find(a => a.id === id && a.deletedAt);
    if (!asset) throw new Error(`Asset "${id}" not found in the bin`);
    await eraseAsset(projectId, project, asset, user);
}

/**
 * Takes back assets a failed import added: their files, copies and hosted videos, and their
 * place in the list. Not a person's action (no permission to check): the import's own undo.
 */
export async function discardImportedAssets(projectId: string, ids: string[]): Promise<void> {
    if (!ids.length) return;
    const project = await getProjectById(projectId);
    if (!project) return;
    const wanted = new Set(ids);
    for (const asset of (await loadAssetsIndex(projectId)).filter(a => wanted.has(a.id)))
        await eraseAsset(projectId, project, asset, SYSTEM_USER as User);
}

/** An asset gone for good: its files, its copies, its video at the host, its place in the list. */
async function eraseAsset(
    projectId: string,
    project: ProjectSchema,
    asset: Asset,
    user: User
): Promise<void> {
    const id = asset.id;
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
        // The project's own keys at the host, else the server's.
        const provider = asset.provider
            ? await getProviderForProject(projectId, asset.provider)
            : null;
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

    // Still at the host it was moving from.
    if (asset.previousHost) await removeFromHost(projectId, asset.previousHost);

    try {
        await adapter.deleteFolder?.(projectId, resizedFolder(asset.id));
    } catch (err) {
        console.error('[moteur] deleteAsset: resized copies not removed', asset.id, err);
    }

    await changeAssets(projectId, user, list => removeFrom(list, id));
}

/** Empties the bin: every asset in it deleted for good. Admins only. */
export async function emptyBin(projectId: string, user: User): Promise<number> {
    assertCanEmptyBin(user);
    const binned = (await loadAssetsIndex(projectId)).filter(a => a.deletedAt);
    for (const asset of binned) await deleteAssetForever(projectId, user, asset.id);
    return binned.length;
}

export async function moveToFolder(
    projectId: string,
    user: User,
    id: string,
    folder: string
): Promise<Asset> {
    return updateAsset(projectId, user, id, { folder });
}

/** Settings values that are secrets (keys, passwords, tokens), shown as `***`. */
export function redactAdapterConfig(
    config: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
    if (!config) return config;
    const redacted = { ...config };
    for (const key of Object.keys(redacted)) {
        const lower = key.toLowerCase();
        if (lower.includes('publicurl') || lower.includes('public_url')) continue;
        if (
            (lower.includes('key') ||
                lower.includes('secret') ||
                lower.includes('password') ||
                lower.includes('token')) &&
            redacted[key]
        ) {
            redacted[key] = '***';
        }
    }
    return redacted;
}

export async function getAssetConfig(projectId: string, user: User) {
    const project = await getProject(user, projectId);
    const config = project.assetConfig ?? {
        variants: getVariantDefinitions(project),
        maxUploadSizeMb: DEFAULT_MAX_SIZE_MB,
        allowedTypes: undefined,
        adapter: 'local' as const,
        adapterConfig: undefined
    };
    return { ...config, adapterConfig: redactAdapterConfig(config.adapterConfig) };
}

/** Same as the media settings' `assetConfig` part (admins only, secrets kept when sent back as `***`). */
export async function updateAssetConfig(
    projectId: string,
    user: User,
    patch: Partial<NonNullable<ProjectSchema['assetConfig']>>
) {
    const { updateProjectMediaSettings } = await import('./mediaSettings.js');
    return (await updateProjectMediaSettings(projectId, user, { assetConfig: patch })).assetConfig;
}

/**
 * Copies every stored file of a project to another storage, then makes it the project's storage.
 * Nothing changes until every file is copied: a failure leaves the project as it was. The files
 * stay on the old storage too (to delete by hand once the new one is checked). Images' copies
 * are made again on the new storage, after; until then they are served from the old one.
 */
export async function moveFilesToStorage(
    projectId: string,
    user: User,
    target: { id: string; adapter: StorageAdapter; config?: Record<string, unknown> }
): Promise<{ moved: number }> {
    const project = await getProject(user, projectId);
    const source = getProjectAdapter(project);
    const copied = new Map<string, { path: string; url: string }>();
    const copyNew = async () => {
        for (const asset of await loadAssetsIndex(projectId)) {
            if (!asset.path || copied.has(asset.id)) continue;
            const buffer = await source.download(asset.path);
            const name = asset.path.split('/').pop() ?? `${asset.id}-${asset.filename}`;
            const result = await target.adapter.upload(
                projectId,
                name,
                buffer,
                asset.mimeType,
                asset.type === 'image' ? 'original' : undefined
            );
            copied.set(asset.id, { path: result.path, url: result.url });
        }
    };
    await copyNew();
    // Uploads made while copying land on the old storage: copy those too before switching.
    await copyNew();

    const { updateProject } = await import('../projects.js');
    await updateProject(user, projectId, {
        assetConfig: {
            ...(project.assetConfig ?? { variants: getVariantDefinitions(project) }),
            adapter: target.id as NonNullable<ProjectSchema['assetConfig']>['adapter'],
            adapterConfig: target.config
        }
    });
    // Any upload since the last pass, still on the old storage.
    await copyNew();

    const images: string[] = [];
    await changeAssets(projectId, user, list => {
        for (const asset of list) {
            const at = copied.get(asset.id);
            if (!at) continue;
            const was = asset.localUrl;
            asset.adapter = target.id;
            asset.path = at.path;
            asset.localUrl = storedUrl(asset, at.url);
            if (asset.variants) {
                asset.variants = asset.variants.map(v =>
                    v.key === 'original' || v.url === was
                        ? { ...v, url: asset.localUrl ?? v.url }
                        : v
                );
            }
            asset.url = resolveAssetUrl(asset);
            if (asset.type === 'image' && !asset.deletedAt) images.push(asset.id);
        }
    });
    const moved = await getProject(user, projectId);
    for (const id of images) void queueImageCopies(moved, id);
    return { moved: copied.size };
}
