import { createHash } from 'crypto';
import type { Asset, AssetText, AssetType, ImageVariant } from '@moteurio/types/Asset.js';
import type { VideoProviderId } from '@moteurio/types/Asset.js';
import { hasRole, inProject, translatorOnly } from '@moteurio/types';
import { workspaceOf } from '../workspaces.js';
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
import {
    isAllowedMime,
    getAssetTypeFromMime,
    nameForType,
    resolveUploadMime
} from './allowedTypes.js';
import { dispatch as webhookDispatch } from '../webhooks/webhookService.js';
import { sanitizeUploadFilename } from './safeUploadFilename.js';
import { ASSET_KINDS, fold, kindOf, textValues } from './assetFacts.js';
import { getAssetIndex } from './assetIndex.js';
import { assertStorageRoom } from '../planLimits.js';

export const DEFAULT_MAX_SIZE_MB = 50;

/** The storage folder holding one asset's on-request sizes. It is deleted together with the asset. */
export const resizedFolder = (assetId: string) => `r-${assetId}`;

/**
 * The URL that serves an image at any size. Append `&w=640`, and optionally `&ar=1:1` or
 * `&fmt=avif`. The `v` parameter changes when the crops change, so caches can keep each
 * response indefinitely.
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
 * The stored form of a local file's URL: `/static/assets/…` without the server address, so the
 * data keeps working when the API moves to another host, port or base path. URLs from other
 * storages are stored unchanged.
 */
function storedUrl(asset: Asset, url: string | undefined): string | undefined {
    if (!url || !isLocal(asset)) return url;
    const at = url.indexOf(STATIC_ASSETS);
    return at < 0 ? url : url.slice(at);
}

/** Builds the URL a local file is served at, whether it was stored with a server address or without. */
function liveUrl(asset: Asset, url: string | undefined): string | undefined {
    if (!url || !isLocal(asset)) return url;
    const at = url.indexOf(STATIC_ASSETS);
    // staticBaseUrl() already ends with `/static`, so append only the rest of the path.
    return at < 0 ? url : `${staticBaseUrl()}${url.slice(at + '/static'.length)}`;
}

/** Returns the asset with its local file URLs resolved against the current server address. */
function withLiveUrls(asset: Asset): Asset {
    return {
        ...asset,
        ...(asset.localUrl ? { localUrl: liveUrl(asset, asset.localUrl) } : {}),
        ...(asset.variants
            ? { variants: asset.variants.map(v => ({ ...v, url: liveUrl(asset, v.url) ?? v.url })) }
            : {})
    };
}

/** Returns the asset as clients read it: resolved URLs and, for images, the on-request size URL. */
function withUrls(stored: Asset): Asset {
    const asset = withLiveUrls(stored);
    const out: Asset = { ...asset, url: resolveAssetUrl(asset) };
    const resize = resizeUrlOf(asset);
    if (resize) out.resizeUrl = resize;
    return out;
}

/**
 * A variant's URL with a version parameter. Rebuilt variants keep their file name, so the
 * version is what tells browsers and caches that the image changed, and lets them cache it
 * indefinitely otherwise.
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
    roles: ['writer'] as string[],
    projects: [] as string[]
};

async function loadAssetsIndex(projectId: string): Promise<Asset[]> {
    const list = await getProjectJson<Asset[]>(projectId, ASSETS_KEY);
    return Array.isArray(list) ? list : [];
}

/** Total bytes of the files a project uploaded. Variants generated from images are not counted. */
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

// ── Serialized changes: one at a time per project, each applied to the latest list ──
const writing = new Map<string, Promise<unknown>>();

/**
 * Applies a change to a project's asset list. Changes run one at a time per project, and each
 * reads the list immediately before saving, so concurrent uploads, finished images and edits
 * never overwrite each other. `change` must be quick and synchronous: do slow work (storage,
 * providers) before or after calling this. If `change` throws, or leaves the list unchanged,
 * nothing is saved.
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

/** Replaces the list entry with the same id as `asset`, if it is still in the list. */
const replaceIn = (list: Asset[], asset: Asset) => {
    const idx = list.findIndex(a => a.id === asset.id);
    if (idx >= 0) list[idx] = { ...asset };
};

/** Removes the asset with this id from the list. */
const removeFrom = (list: Asset[], id: string) => {
    const idx = list.findIndex(a => a.id === id);
    if (idx >= 0) list.splice(idx, 1);
};

/** The content hash of an uploaded file, used to detect the same file being uploaded again. */
export const fileHash = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');

/** Checks every upload must pass: media enabled, file size, remaining storage on the plan, and an allowed file kind. */
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
 * Lets plugins react to a new or replaced file (for example, a plugin that writes image
 * descriptions), then re-reads the asset to pick up their changes. The file is always saved:
 * an error thrown by a listener is logged, not rethrown.
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

/**
 * Checks whether a file may be added to the project, using the same rules as an upload: its
 * type, its size, the project's storage quota (plus `alsoStoring` bytes about to be added) and,
 * for an image, that it can be decoded. Throws the same errors an upload would and stores
 * nothing. Import dry runs use it.
 */
export async function checkUpload(
    projectId: string,
    user: User,
    file: UploadFile,
    alsoStoring = 0
): Promise<{ mimeType: string; assetType: ReturnType<typeof assertUploadAllowed> }> {
    assertCanWrite(user);
    const mimeType = resolveUploadMime(file.mimeType, sanitizeUploadFilename(file.originalName));
    const project = await getProject(user, projectId);
    const assetType = assertUploadAllowed(
        project,
        file.buffer.length,
        mimeType,
        (await storageUsed(projectId)) + alsoStoring
    );
    if (assetType === 'image') await readImageShape(file.buffer);
    return { mimeType, assetType };
}

export async function uploadAsset(
    projectId: string,
    user: User,
    file: UploadFile,
    options?: UploadOptions
): Promise<Asset> {
    const { mimeType, assetType } = await checkUpload(projectId, user, file);
    let buffer = file.buffer;
    file = { ...file, mimeType };
    const safeOriginalName = nameForType(sanitizeUploadFilename(file.originalName), file.mimeType);
    const project = await getProject(user, projectId);
    const hash = fileHash(buffer);
    // Strip camera and location metadata (EXIF GPS etc.) so uploads don't leak where a photo was taken.
    if (assetType === 'image') buffer = await stripImageMetadata(buffer, file.mimeType);

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
        // Store the file locally first so the upload responds immediately and nothing is lost if
        // the host refuses the video or the server restarts. The local copy is deleted once the
        // host reports the video ready, unless the project keeps local copies.
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
            // A failing event listener must not fail the operation.
        }
        void queueVideoUpload(project, id, buffer);
        return afterFile('asset.afterCreate', projectId, user, withUrls(initial), options?.alt);
    }

    // Image, document, 3D model, or a video when no video host is configured.
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
        // Store the original now; variants are generated after the response (see imageQueue).
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
            // Unreadable image: variant generation will fail and mark the asset.
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
        // A failing event listener must not fail the operation.
    }
    if (queueCopies) void queueImageCopies(project, id, buffer);
    return afterFile('asset.afterCreate', projectId, user, withUrls(initial), options?.alt);
}

/** Verifies a video host webhook signature against the project's provider config. */
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

// ── Videos at a host (Mux, Vimeo…): sent after the upload responds, then polled ──

const videoJobs = new Map<string, Promise<void>>();
/** How many videos are sent to hosts at once. A bulk move of hundreds runs two at a time. */
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
/** How long to poll a host about one video before relying on webhooks alone. */
const WATCH_FOR_MS = 6 * 60 * 60 * 1000;
const isSettled = (status: string | undefined) => status === 'ready' || status === 'error';

const pause = (ms: number) =>
    new Promise<void>(resolve => {
        const timer = setTimeout(resolve, ms);
        timer.unref?.();
    });

/**
 * Records the status a video host reports, from a webhook, an upload response or a status
 * check. The video is found by `correlationId` (our asset id, sent with the upload) or, failing
 * that, by its id at the host. Once the video is ready, the local copy is deleted unless the
 * project keeps local copies.
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
        // The move to this host has finished, so the previous host's copy can be deleted.
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
 * Sends a stored video to its host after the upload request has responded. If the host refuses
 * it, the failure is recorded on the asset (`providerStatus: 'error'`, with the reason in
 * `providerMetadata.error`) and the local copy is kept so `retryVideoUpload` can send it again.
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

/** Resolves when a video's upload to its host has finished, or immediately if none is running. */
export function whenVideoSent(projectId: string, id: string): Promise<void> {
    return videoJobs.get(`${projectId}/${id}`) ?? Promise.resolve();
}

/** Asks the host for one video's status and records it. Returns null when the host can't report a status. */
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
 * Polls the host about a video until it is ready or has failed: every 5 seconds at first, then
 * backing off to once a minute, for up to six hours. Webhooks still work alongside polling.
 * Hosts that cannot be polled (no `getStatus`) rely on webhooks only.
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

/** Polls the host immediately for a video's status and returns the asset as updated by the result. */
export async function checkVideoStatus(projectId: string, user: User, id: string): Promise<Asset> {
    await getProject(user, projectId);
    const current = await getAsset(projectId, id);
    if (!current) throw new Error(`Asset "${id}" not found`);
    if (!current.provider)
        throw Object.assign(new Error('This video is not at a video host.'), { statusCode: 400 });
    await askHost(projectId, id);
    return (await getAsset(projectId, id)) ?? current;
}

/** Sends a video the host refused again, using the local copy. */
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
        // The host failed to process the file, so start over with a new upload.
        found.providerId = '';
        found.providerStatus = 'uploading';
        found.providerMetadata = {};
        found.updatedAt = new Date().toISOString();
        return { ...found };
    });
    void queueVideoUpload(project, id);
    return withUrls(asset);
}

/** Deletes a video from a host it was moved away from. Best effort: it may already be gone. */
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

/** Where a video is stored: a video host, or this server. */
export type VideoHome = VideoProviderId | 'local';

/**
 * Moves a project's videos to wherever new videos are stored: its video host, or this server
 * when no host is configured. Admins only. Each video is sent from its local copy in the
 * background, two at a time, and keeps playing from its old location until the new host reports
 * it ready. Videos without a local copy stay where they are and remain playable, because the
 * old host's keys are kept. With `removeFromOld`, each video is deleted from its old host once
 * it is ready at the new one.
 */
export async function moveVideosToHost(
    projectId: string,
    user: User,
    options: { from?: VideoHome; removeFromOld?: boolean } = {}
): Promise<{ to: VideoHome; moving: number; staying: number }> {
    if (!hasRole(user, 'lead'))
        throw contentForbidden('Only a content lead or an admin can move videos.');
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
 * Resumes videos interrupted by a restart: re-sends those whose upload to the host had not
 * finished and resumes polling those the host was still processing. Call once at startup.
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
 * Moves videos for several projects (POST /studio/assets/migrate-provider), one project at a
 * time on top of `moveVideosToHost`: `projectIds` is required, the person must be an admin of each,
 * and `toProvider` must be where that project's new videos go (Setup › Media). Kept for
 * scripts; new code should use `moveVideosToHost`.
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
            const there = inProject(user, project, workspaceOf(project));
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
 * Generates and stores an image's variants (every variant except the original). Variants are
 * rotated upright, never enlarged, and cropped around the focal point. Their URLs include the
 * time they were generated.
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

/** Saves the result of variant generation (success or failure), merging with changes saved in the meantime. */
async function storeCopies(
    projectId: string,
    id: string,
    result: { variants: ImageVariant[]; width: number; height: number } | null
): Promise<Asset | null> {
    const next = await changeAssets(projectId, undefined, list => {
        const idx = list.findIndex(a => a.id === id);
        if (idx < 0) return null; // The asset was deleted while its variants were being generated.
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

// ── Background copies: uploads respond immediately and variants are generated afterwards, two
// images at a time ──
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
 * Generates an uploaded image's variants after the response has been sent. `buffer` is the
 * original file if the upload still holds it; otherwise it is read back from storage.
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

/** Resolves when an image's variants have been generated, or immediately if none are being generated. */
export function whenAssetReady(projectId: string, id: string): Promise<void> {
    return imageJobs.get(`${projectId}/${id}`) ?? Promise.resolve();
}

/**
 * Resumes images left in processing by a restart. Their originals are already stored; only the
 * variants are missing. Call once at startup.
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
 * Same as regenerateVariants, but returns immediately. The images are regenerated in the
 * background, two at a time, and each image's variants are replaced as soon as it is done.
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
 * Keeps only the metadata a user may edit, normalized to the shapes the engine expects.
 * Multi-language texts drop empty languages, and a map where every language is empty clears
 * the text.
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
        /** An asset with the same content hash (see `fileHash`). Assets in the bin are included. */
        hash?: string;
        includeBinned?: boolean;
    }
): Promise<Asset[]> {
    // Detect a duplicate upload with one index lookup instead of scanning the whole list.
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

/** A library filter: a file kind, or `unused` for files that no entry or page references. */
export type AssetKindFilter = AssetType | 'unused';

/** Library-wide summary: the number of files of each kind and the folders in use. */
export type AssetFacets = {
    total: number;
    kinds: Record<AssetKindFilter, number>;
    folders: string[];
};

export type AssetPage = {
    assets: Asset[];
    /** Total number of files matching the filters across all pages. */
    total: number;
    offset: number;
    limit: number;
    /** Counts for the tabs and the folders in use. Only computed when the caller asks for them. */
    facets?: AssetFacets;
};

/** Maximum number of files in one page. */
export const MAX_ASSET_PAGE = 500;

/**
 * Returns one page of the library, newest first. It can filter by kind (or `unused`), by folder
 * (`''` for files in no folder) and by search words matched against the name, title, alt text
 * or caption in any language. Files in the bin are excluded. Finding unused files reads every
 * entry and page, so it only runs for the `unused` filter and when facets are requested.
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

    // Without the index (MOTEUR_CONTENT_INDEX=files), read the whole file and filter in memory.
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

/** Returns an asset by id. An asset in the bin is treated as missing, as it is in content. */
export async function getAsset(projectId: string, id: string): Promise<Asset | null> {
    const assets = await loadAssetsIndex(projectId);
    const asset = assets.find(a => a.id === id && !a.deletedAt);
    if (!asset) return null;
    return withUrls(asset);
}

/** The metadata a user may change on an asset. A `null` value clears the field. */
export type AssetPatch = {
    title?: AssetText | null;
    alt?: AssetText | null;
    caption?: AssetText | null;
    description?: string | null;
    credit?: string | null;
    folder?: string | null;
    focalPoint?: { x: number; y: number } | null;
};

/** Maximum number of assets one batch may change. */
export const MAX_ASSET_BATCH = 500;

/** Validates the ids of a batch: a non-empty list of unique strings within the batch size limit. */
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
        // A failing event listener must not fail the operation.
    }
}

/**
 * Changes the metadata of several assets in one save (one entry in the project's history), for
 * example alt texts for a whole folder or a credit for a photo shoot. All or nothing: if any
 * asset is missing or in the bin, or the user may not make a change (for example a translator),
 * none of the assets is changed.
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

    // Crops are made around the focal point, so rebuild the copies of images whose point moved.
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
        // Sizes generated on request were cropped around the old focal point; delete them.
        const adapter = getProjectAdapter(project);
        for (const id of refocused) await adapter.deleteFolder?.(projectId, resizedFolder(id));
        await regenerateVariants(projectId, user, refocused);
        const fresh = new Map((await loadAssetsIndex(projectId)).map(a => [a.id, a]));
        return results.map(({ updated }) => withUrls(fresh.get(updated.id) ?? updated));
    }
    // If the same asset appears twice in the batch, keep its last state.
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
 * Moves assets to the bin in one save. They disappear from the library and from content (a
 * field that references one reads as empty) and can be restored. Their files are kept until the
 * bin is emptied. Clients should warn first when content uses them.
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
            // A failing event listener must not fail the operation.
        }
    }
    return binned.map(withUrls);
}

/** Moves one asset to the bin (see `binAssets`). */
export async function deleteAsset(projectId: string, user: User, id: string): Promise<void> {
    await binAssets(projectId, user, [id]);
}

/**
 * Replaces an asset's file while keeping its id, so everything that references it shows the new
 * file. Its title, alt text, credit, folder and focal point are kept. The new file must be the
 * same kind (an image for an image). For images, variants are regenerated and on-request sizes
 * are cleared.
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
    const mimeType = resolveUploadMime(file.mimeType, sanitizeUploadFilename(file.originalName));
    const safeName = nameForType(sanitizeUploadFilename(file.originalName), mimeType);
    const type = assertUploadAllowed(
        project,
        file.buffer.length,
        mimeType,
        // The file being replaced frees its space, so don't count it against the quota.
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
    // Use a new file name each time so caches holding the old file can't serve it for the new one.
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

    // The old file and every copy made from it.
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
        // A failing event listener must not fail the operation.
    }
    return afterFile('asset.afterReplace', projectId, user, withUrls(updated));
}

/** Lists the assets in the bin, most recently binned first. */
export async function listBinnedAssets(projectId: string, user: User): Promise<Asset[]> {
    await getProject(user, projectId);
    return (await loadAssetsIndex(projectId))
        .filter(a => a.deletedAt)
        .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''))
        .map(withUrls);
}

/** Restores assets from the bin in one save. They reappear in the library and wherever content references them. */
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
            // A failing event listener must not fail the operation.
        }
    }
    return restored.map(withUrls);
}

/** Restores one asset from the bin (see `restoreAssets`). */
export async function restoreAsset(projectId: string, user: User, id: string): Promise<Asset> {
    const [asset] = await restoreAssets(projectId, user, [id]);
    return asset;
}

function assertCanEmptyBin(user: User): void {
    if (!hasRole(user, 'lead'))
        throw contentForbidden('Only a content lead or an admin can delete files for good.');
}

/** Permanently deletes an asset in the bin: its files, its variants and its video at the host. Content leads and admins only. */
export async function deleteAssetForever(projectId: string, user: User, id: string): Promise<void> {
    assertCanEmptyBin(user);
    const project = await getProject(user, projectId);
    const asset = (await loadAssetsIndex(projectId)).find(a => a.id === id && a.deletedAt);
    if (!asset) throw new Error(`Asset "${id}" not found in the bin`);
    await eraseAsset(projectId, project, asset, user);
}

/**
 * Rolls back assets added by a failed import: deletes their files, variants and hosted videos,
 * and removes them from the list. This is the import's own undo, not a user action, so it does
 * no permission check.
 */
export async function discardImportedAssets(projectId: string, ids: string[]): Promise<void> {
    if (!ids.length) return;
    const project = await getProjectById(projectId);
    if (!project) return;
    const wanted = new Set(ids);
    for (const asset of (await loadAssetsIndex(projectId)).filter(a => wanted.has(a.id)))
        await eraseAsset(projectId, project, asset, SYSTEM_USER as User);
}

/** Permanently removes an asset: its files, its variants, its video at the host and its entry in the list. */
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
        // Use the project's own keys for the host, falling back to the server's.
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

    // Delete the copy left at the previous host if the video was being moved away from it.
    if (asset.previousHost) await removeFromHost(projectId, asset.previousHost);

    try {
        await adapter.deleteFolder?.(projectId, resizedFolder(asset.id));
    } catch (err) {
        console.error('[moteur] deleteAsset: resized copies not removed', asset.id, err);
    }

    await changeAssets(projectId, user, list => removeFrom(list, id));
}

/** Empties the bin by permanently deleting every asset in it. Content leads and admins only. */
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

/** Masks settings values that are secrets (keys, passwords, tokens) as `***`. */
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

/** Updates the `assetConfig` part of the media settings. Content leads and admins only; secrets sent back as `***` keep their stored values. */
export async function updateAssetConfig(
    projectId: string,
    user: User,
    patch: Partial<NonNullable<ProjectSchema['assetConfig']>>
) {
    const { updateProjectMediaSettings } = await import('./mediaSettings.js');
    return (await updateProjectMediaSettings(projectId, user, { assetConfig: patch })).assetConfig;
}

/**
 * Copies every stored file of a project to another storage, then switches the project to it.
 * Nothing changes until every file is copied, so a failure leaves the project as it was. The
 * files also stay on the old storage, to be deleted manually once the new one is verified.
 * Image variants are regenerated on the new storage afterwards and are served from the old
 * storage until then.
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
    // Uploads made while copying land on the old storage, so copy those too before switching.
    await copyNew();

    const { updateProject } = await import('../projects.js');
    await updateProject(user, projectId, {
        assetConfig: {
            ...(project.assetConfig ?? { variants: getVariantDefinitions(project) }),
            adapter: target.id as NonNullable<ProjectSchema['assetConfig']>['adapter'],
            adapterConfig: target.config
        }
    });
    // Copy any upload made since the last pass; it is still on the old storage.
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
