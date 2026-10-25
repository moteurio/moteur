/**
 * Single write path for admin Media Settings: assetConfig + videoProviders.
 * Empty or *** incoming values for credentials keep existing stored values.
 */
import type { User } from '@moteurio/types/User.js';
import type { ProjectSchema, VideoProvidersConfig } from '@moteurio/types/Project.js';
import type { AssetType } from '@moteurio/types/Asset.js';
import type { VariantDefinition } from '@moteurio/types/VariantDefinition.js';
import { hasRole } from '@moteurio/types';
import { getProject, updateProject } from '../projects.js';
import { contentForbidden } from '../contentAccess.js';
import { getProjectJson } from '../utils/projectStorage.js';
import { ASSETS_KEY } from '../utils/storageKeys.js';
import {
    DEFAULT_MAX_SIZE_MB,
    getAssetConfig,
    moveFilesToStorage,
    moveVideosToHost,
    redactAdapterConfig
} from './assetService.js';
import { createAdapter, storageIds } from './adapterRegistry.js';
import { videoProviderIds } from './providerRegistry.js';
import { DEFAULT_IMAGE_VARIANTS, getVariantDefinitions } from './defaultVariants.js';
import { listMediaVariantPresets } from '../plugins/mediaPipeline.js';
import { ALLOWED_MIME } from './allowedTypes.js';

const SECRET = '***';

function badRequest(message: string, code: string): Error {
    return Object.assign(new Error(message), { statusCode: 400, code });
}

function assertAdmin(user: User): void {
    if (!hasRole(user, 'admin')) throw contentForbidden('Only an admin can change media settings.');
}

/** Video host settings with every secret shown as `***` (and an empty string when not set). */
export function redactVideoProviders(
    vp: VideoProvidersConfig | undefined
): VideoProvidersConfig | undefined {
    if (!vp) return vp;
    const hide = (v: string | undefined) => (v ? SECRET : '');
    return {
        active: vp.active,
        keepLocalCopy: vp.keepLocalCopy,
        ...(vp.mux && {
            mux: {
                tokenId: vp.mux.tokenId,
                tokenSecret: hide(vp.mux.tokenSecret),
                webhookSecret: hide(vp.mux.webhookSecret)
            }
        }),
        ...(vp.vimeo && {
            vimeo: {
                accessToken: hide(vp.vimeo.accessToken),
                webhookSecret: hide(vp.vimeo.webhookSecret)
            }
        }),
        ...(vp.cloudflareStream && {
            cloudflareStream: {
                accountId: vp.cloudflareStream.accountId,
                apiToken: hide(vp.cloudflareStream.apiToken),
                webhookSecret: hide(vp.cloudflareStream.webhookSecret)
            }
        }),
        ...(vp.youtube && {
            youtube: {
                clientId: vp.youtube.clientId,
                clientSecret: hide(vp.youtube.clientSecret),
                refreshToken: hide(vp.youtube.refreshToken)
            }
        })
    };
}

/** A project as sent to people: storage and video host secrets shown as `***`. */
export function redactProjectSecrets<T extends Partial<ProjectSchema>>(project: T): T {
    if (
        !project.assetConfig?.adapterConfig &&
        !project.videoProviders &&
        !project.integrations?.shopify?.accessToken
    ) {
        return project;
    }
    return {
        ...project,
        ...(project.assetConfig && {
            assetConfig: {
                ...project.assetConfig,
                adapterConfig: redactAdapterConfig(project.assetConfig.adapterConfig)
            }
        }),
        ...(project.videoProviders && {
            videoProviders: redactVideoProviders(project.videoProviders)
        }),
        ...(project.integrations?.shopify && {
            integrations: {
                ...project.integrations,
                shopify: {
                    ...project.integrations.shopify,
                    ...(project.integrations.shopify.accessToken ? { accessToken: '***' } : {})
                }
            }
        })
    };
}

const FITS = ['cover', 'contain', 'fill', 'inside', 'outside'];
const FORMATS = ['webp', 'jpg', 'png', 'avif'];
const MAX_SIDE = 10000;
const MAX_UPLOAD_MB = 5000;

function checkVariants(variants: VariantDefinition[]): void {
    if (!Array.isArray(variants)) throw badRequest('Image sizes must be a list', 'variants');
    const keys = new Set<string>();
    for (const v of variants) {
        if (v.key === 'original')
            throw badRequest("Variant key 'original' is reserved", 'variants');
        if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(v.key ?? ''))
            throw badRequest(`Invalid variant key: ${v.key}`, 'variants');
        if (keys.has(v.key)) throw badRequest(`Duplicate variant key: ${v.key}`, 'variants');
        keys.add(v.key);
        const side = (n: number | undefined) =>
            n === undefined || (Number.isInteger(n) && n > 0 && n <= MAX_SIDE);
        if (!side(v.width) || !side(v.height) || (v.width === undefined && v.height === undefined))
            throw badRequest(
                `Size "${v.key}": a width or a height is required (1–${MAX_SIDE})`,
                'variants'
            );
        if (!FITS.includes(v.fit)) throw badRequest(`Size "${v.key}": invalid fit`, 'variants');
        if (!FORMATS.includes(v.format))
            throw badRequest(`Size "${v.key}": invalid format`, 'variants');
        if (
            v.quality !== undefined &&
            !(Number.isInteger(v.quality) && v.quality >= 1 && v.quality <= 100)
        )
            throw badRequest(`Size "${v.key}": quality is 1–100`, 'variants');
    }
}

/** Files a project keeps on its storage (originals, in the bin too); hosted videos aren't counted. */
async function storedFileCount(projectId: string): Promise<number> {
    const list = await getProjectJson<{ path?: string }[]>(projectId, ASSETS_KEY);
    return Array.isArray(list) ? list.filter(a => a.path).length : 0;
}

/** The keys slot of each video host in `videoProviders`. */
const HOST_SLOT = {
    mux: 'mux',
    vimeo: 'vimeo',
    'cloudflare-stream': 'cloudflareStream',
    youtube: 'youtube'
} as const;

type StoredVideo = {
    type?: string;
    provider?: string;
    path?: string;
    deletedAt?: string;
    previousHost?: { provider: string };
};

/**
 * Where a project's videos are: per host (or `local`, this server), how many, and how many have
 * a copy here (those can move to another host). Videos in the bin are left out.
 */
async function videoHomes(
    projectId: string
): Promise<Record<string, { count: number; withCopy: number }>> {
    const list = (await getProjectJson<StoredVideo[]>(projectId, ASSETS_KEY)) ?? [];
    const out: Record<string, { count: number; withCopy: number }> = {};
    for (const a of list) {
        if (a.type !== 'video' || a.deletedAt) continue;
        const home = (out[a.provider ?? 'local'] ??= { count: 0, withCopy: 0 });
        home.count++;
        if (a.path) home.withCopy++;
    }
    return out;
}

/**
 * Forgets a video host's keys. Refused for the host taking new videos, and while any video (in
 * the bin too, or moving away) is still there: Moteur needs the keys to delete it.
 */
export async function forgetVideoHost(projectId: string, user: User, host: string) {
    assertAdmin(user);
    const project = await getProject(user, projectId);
    const slot = HOST_SLOT[host as keyof typeof HOST_SLOT];
    if (!slot) throw badRequest(`Unknown video host "${host}"`, 'video_host');
    if (project.videoProviders?.active === host)
        throw badRequest('New videos go to this host: pick another first', 'host_active');
    const list = (await getProjectJson<StoredVideo[]>(projectId, ASSETS_KEY)) ?? [];
    const still = list.filter(
        a => a.type === 'video' && (a.provider === host || a.previousHost?.provider === host)
    ).length;
    if (still)
        throw Object.assign(
            new Error(`${still} video(s) are still at this host: move or delete them first`),
            { statusCode: 409, code: 'host_in_use', count: still }
        );
    if (project.videoProviders?.[slot]) {
        const next = { ...project.videoProviders };
        delete next[slot];
        await updateProject(user, projectId, { videoProviders: next });
    }
    return redactVideoProviders((await getProject(user, projectId)).videoProviders);
}

/** Media settings as shown in Setup: secrets hidden, with what this server offers. */
export async function getProjectMediaSettings(projectId: string, user: User) {
    const project = await getProject(user, projectId);
    return {
        assetConfig: await getAssetConfig(projectId, user),
        videoProviders: redactVideoProviders(project.videoProviders),
        storages: storageIds(),
        videoHosts: videoProviderIds(),
        storedFiles: await storedFileCount(projectId),
        videos: await videoHomes(projectId),
        defaults: {
            maxUploadSizeMb: DEFAULT_MAX_SIZE_MB,
            variants: DEFAULT_IMAGE_VARIANTS,
            types: Object.keys(ALLOWED_MIME) as AssetType[],
            presets: listMediaVariantPresets().map(p => ({
                id: p.id,
                label: p.label,
                variants: p.variants
            }))
        }
    };
}

/** Storage settings as they would be saved: secrets left empty or `***` keep the stored ones. */
async function targetStorage(
    projectId: string,
    user: User,
    body: { adapter?: string; adapterConfig?: Record<string, unknown> }
) {
    assertAdmin(user);
    const project = await getProject(user, projectId);
    const id = body.adapter ?? project.assetConfig?.adapter ?? 'local';
    if (!storageIds().includes(id))
        throw badRequest(`Storage "${id}" is not available on this server`, 'storage');
    const current = project.assetConfig?.adapter ?? 'local';
    const config =
        id === 'local'
            ? undefined
            : mergeAdapterConfigPreservingSecrets(
                  id === current
                      ? (project.assetConfig?.adapterConfig as Record<string, unknown> | undefined)
                      : undefined,
                  body.adapterConfig ?? {}
              );
    return { id, config, current, project };
}

/**
 * Tries storage settings before they are saved: writes a small file, reads it back, deletes it.
 * Answers with what went wrong instead of throwing.
 */
export async function checkStorage(
    projectId: string,
    user: User,
    body: { adapter?: string; adapterConfig?: Record<string, unknown> }
): Promise<{ ok: boolean; error?: string }> {
    const { id, config } = await targetStorage(projectId, user, body);
    try {
        const adapter = createAdapter(id, config);
        const name = `moteur-check-${Date.now()}.txt`;
        const bytes = Buffer.from('moteur storage check');
        const stored = await adapter.upload(projectId, name, bytes, 'text/plain', 'original');
        const back = await adapter.download(stored.path);
        await adapter.delete(stored.path);
        if (!back.equals(bytes)) return { ok: false, error: 'The file read back was different.' };
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}

/** Switches the project to another storage, copying its files there first (admins only). */
export async function moveProjectStorage(
    projectId: string,
    user: User,
    body: { adapter?: string; adapterConfig?: Record<string, unknown> }
): Promise<{ moved: number }> {
    const { id, config } = await targetStorage(projectId, user, body);
    const check = await checkStorage(projectId, user, body);
    if (!check.ok) throw badRequest(`Storage check failed: ${check.error}`, 'storage_check');
    return moveFilesToStorage(projectId, user, { id, adapter: createAdapter(id, config), config });
}

function isCredentialFieldKey(key: string): boolean {
    const lower = key.toLowerCase();
    if (lower.includes('publicurl') || lower.includes('public_url')) return false;
    return (
        lower.includes('secret') ||
        lower.includes('password') ||
        lower.includes('token') ||
        lower.includes('accesskey')
    );
}

function pickCredential(incoming: unknown, stored: unknown): unknown {
    if (incoming === undefined || incoming === null) return stored;
    if (typeof incoming === 'string') {
        const t = incoming.trim();
        if (t === '' || t === '***') return stored;
        return incoming;
    }
    return incoming;
}

/** Merge incoming adapterConfig onto current; empty credential fields keep stored values. */
export function mergeAdapterConfigPreservingSecrets(
    current: Record<string, unknown> | undefined,
    incoming: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
    if (incoming === undefined) return current;
    const base: Record<string, unknown> = { ...(current ?? {}) };
    for (const [k, v] of Object.entries(incoming)) {
        if (isCredentialFieldKey(k)) {
            const merged = pickCredential(v, base[k]);
            if (merged !== undefined && merged !== '') base[k] = merged;
            else delete base[k];
        } else if (v !== undefined) {
            base[k] = v;
        }
    }
    const keys = Object.keys(base);
    if (keys.length === 0) return undefined;
    return base;
}

function mergeMux(
    current: VideoProvidersConfig['mux'],
    incoming: VideoProvidersConfig['mux'] | undefined
): VideoProvidersConfig['mux'] | undefined {
    if (!incoming && !current) return undefined;
    const tokenId = pickCredential(incoming?.tokenId, current?.tokenId) as string;
    const tokenSecret = pickCredential(incoming?.tokenSecret, current?.tokenSecret) as string;
    const webhookSecret = pickCredential(incoming?.webhookSecret, current?.webhookSecret) as string;
    const tid = typeof tokenId === 'string' ? tokenId.trim() : '';
    const ts = typeof tokenSecret === 'string' ? tokenSecret : '';
    const wh = typeof webhookSecret === 'string' ? webhookSecret : '';
    if (!tid && !ts && !wh) return undefined;
    return {
        tokenId: tid,
        tokenSecret: ts,
        webhookSecret: wh
    };
}

function mergeVimeo(
    current: VideoProvidersConfig['vimeo'],
    incoming: VideoProvidersConfig['vimeo'] | undefined
): VideoProvidersConfig['vimeo'] | undefined {
    if (!incoming && !current) return undefined;
    const accessToken = pickCredential(incoming?.accessToken, current?.accessToken) as string;
    const webhookSecret = pickCredential(incoming?.webhookSecret, current?.webhookSecret) as string;
    const at = typeof accessToken === 'string' ? accessToken.trim() : '';
    const wh = typeof webhookSecret === 'string' ? webhookSecret : '';
    if (!at && !wh) return undefined;
    return { accessToken: at, webhookSecret: wh };
}

function mergeCloudflareStream(
    current: VideoProvidersConfig['cloudflareStream'],
    incoming: VideoProvidersConfig['cloudflareStream'] | undefined
): VideoProvidersConfig['cloudflareStream'] | undefined {
    if (!incoming && !current) return undefined;
    const accountId = pickCredential(incoming?.accountId, current?.accountId) as string;
    const apiToken = pickCredential(incoming?.apiToken, current?.apiToken) as string;
    const webhookSecret = pickCredential(incoming?.webhookSecret, current?.webhookSecret) as string;
    const aid = typeof accountId === 'string' ? accountId.trim() : '';
    const tok = typeof apiToken === 'string' ? apiToken : '';
    const wh = typeof webhookSecret === 'string' ? webhookSecret : '';
    if (!aid && !tok && !wh) return undefined;
    return { accountId: aid, apiToken: tok, webhookSecret: wh };
}

function mergeYoutube(
    current: VideoProvidersConfig['youtube'],
    incoming: VideoProvidersConfig['youtube'] | undefined
): VideoProvidersConfig['youtube'] | undefined {
    if (!incoming && !current) return undefined;
    const clientId = pickCredential(incoming?.clientId, current?.clientId) as string;
    const clientSecret = pickCredential(incoming?.clientSecret, current?.clientSecret) as string;
    const refreshToken = pickCredential(incoming?.refreshToken, current?.refreshToken) as string;
    const cid = typeof clientId === 'string' ? clientId.trim() : '';
    const cs = typeof clientSecret === 'string' ? clientSecret : '';
    const rt = typeof refreshToken === 'string' ? refreshToken : '';
    if (!cid && !cs && !rt) return undefined;
    return { clientId: cid, clientSecret: cs, refreshToken: rt };
}

/**
 * Video host settings after an update. Keys are kept for every host, not only the one in use:
 * videos already at a host stay there when another takes the new uploads, and Moteur still needs
 * that host's keys to delete or move them. Forgetting a host's keys is `forgetVideoHost`.
 * `active` unset means no host: new videos stay on this server.
 */
export function mergeVideoProvidersPayload(
    current: VideoProvidersConfig | undefined,
    incoming: VideoProvidersConfig | undefined
): VideoProvidersConfig | undefined {
    if (incoming === undefined) return current;
    const slot = <K extends 'mux' | 'vimeo' | 'cloudflareStream' | 'youtube'>(
        key: K,
        merge: (
            c: VideoProvidersConfig[K],
            i: VideoProvidersConfig[K] | undefined
        ) => VideoProvidersConfig[K] | undefined
    ) => (incoming[key] !== undefined ? merge(current?.[key], incoming[key]) : current?.[key]);
    const next: VideoProvidersConfig = {
        active: incoming.active,
        keepLocalCopy: incoming.keepLocalCopy ?? current?.keepLocalCopy ?? false
    };
    const mux = slot('mux', mergeMux);
    const vimeo = slot('vimeo', mergeVimeo);
    const cloudflareStream = slot('cloudflareStream', mergeCloudflareStream);
    const youtube = slot('youtube', mergeYoutube);
    if (mux) next.mux = mux;
    if (vimeo) next.vimeo = vimeo;
    if (cloudflareStream) next.cloudflareStream = cloudflareStream;
    if (youtube) next.youtube = youtube;
    return next;
}

export function validateMergedVideoProviders(vp: VideoProvidersConfig | undefined): void {
    if (!vp?.active) return;
    if (vp.active === 'mux') {
        const m = vp.mux;
        if (!m?.tokenId?.trim()) throw new Error('Mux: Token ID is required');
        if (!m?.tokenSecret?.trim()) throw new Error('Mux: Token secret is required');
        if (!m?.webhookSecret?.trim()) throw new Error('Mux: Webhook secret is required');
    } else if (vp.active === 'vimeo') {
        const v = vp.vimeo;
        if (!v?.accessToken?.trim()) throw new Error('Vimeo: Access token is required');
        if (!v?.webhookSecret?.trim()) throw new Error('Vimeo: Webhook secret is required');
    } else if (vp.active === 'cloudflare-stream') {
        const c = vp.cloudflareStream;
        if (!c?.accountId?.trim()) throw new Error('Cloudflare Stream: Account ID is required');
        if (!c?.apiToken?.trim()) throw new Error('Cloudflare Stream: API token is required');
        if (!c?.webhookSecret?.trim())
            throw new Error('Cloudflare Stream: Webhook secret is required');
    } else if (vp.active === 'youtube') {
        const y = vp.youtube;
        if (!y?.clientId?.trim()) throw new Error('YouTube: Client ID is required');
        if (!y?.clientSecret?.trim()) throw new Error('YouTube: Client secret is required');
        if (!y?.refreshToken?.trim()) throw new Error('YouTube: Refresh token is required');
    }
}

export type MediaSettingsUpdateInput = {
    assetConfig?: Partial<NonNullable<ProjectSchema['assetConfig']>>;
    videoProviders?: VideoProvidersConfig | null;
};

export async function updateProjectMediaSettings(
    projectId: string,
    user: User,
    body: MediaSettingsUpdateInput
): Promise<{
    assetConfig: Awaited<ReturnType<typeof getAssetConfig>>;
    videoProviders?: VideoProvidersConfig;
}> {
    assertAdmin(user);
    const project = await getProject(user, projectId);
    const currentAc: Partial<NonNullable<ProjectSchema['assetConfig']>> = project.assetConfig ?? {};
    const patch = body.assetConfig;

    let nextVideo = project.videoProviders;
    if (body.videoProviders === null) {
        // No host for new videos; the keys stay for the videos still at one.
        nextVideo = project.videoProviders
            ? { ...project.videoProviders, active: undefined }
            : undefined;
    } else if (body.videoProviders !== undefined) {
        const host = body.videoProviders.active;
        if (host && host !== project.videoProviders?.active && !videoProviderIds().includes(host))
            throw badRequest(`Video host "${host}" is not available on this server`, 'video_host');
        nextVideo = mergeVideoProvidersPayload(project.videoProviders, body.videoProviders);
        validateMergedVideoProviders(nextVideo);
    }

    let updatedAsset: NonNullable<ProjectSchema['assetConfig']> | undefined;

    if (patch !== undefined) {
        if (patch.variants) checkVariants(patch.variants);
        if (
            patch.maxUploadSizeMb !== undefined &&
            !(
                typeof patch.maxUploadSizeMb === 'number' &&
                patch.maxUploadSizeMb > 0 &&
                patch.maxUploadSizeMb <= MAX_UPLOAD_MB
            )
        )
            throw badRequest(`Upload limit is 1–${MAX_UPLOAD_MB} MB`, 'max_upload');
        if (
            patch.allowedTypes != null &&
            (!Array.isArray(patch.allowedTypes) ||
                patch.allowedTypes.some(t => !(t in ALLOWED_MIME)))
        )
            throw badRequest('Unknown file kind', 'allowed_types');
        const nextAdapter = patch.adapter ?? currentAc.adapter ?? 'local';
        if (nextAdapter !== (currentAc.adapter ?? 'local')) {
            if (!storageIds().includes(nextAdapter))
                throw badRequest(
                    `Storage "${nextAdapter}" is not available on this server`,
                    'storage'
                );
            // Files already stored would be left behind: they have to be moved.
            if ((await storedFileCount(projectId)) > 0)
                throw badRequest(
                    'This project has files: move them to change storage',
                    'storage_has_files'
                );
        }
        let mergedAdapter: Record<string, unknown> | undefined;
        if (nextAdapter === 'local') {
            const ac = patch.adapterConfig as Record<string, unknown> | undefined;
            mergedAdapter = ac !== undefined && Object.keys(ac).length > 0 ? { ...ac } : undefined;
        } else {
            mergedAdapter =
                patch.adapterConfig !== undefined
                    ? mergeAdapterConfigPreservingSecrets(
                          currentAc.adapterConfig as Record<string, unknown> | undefined,
                          patch.adapterConfig as Record<string, unknown> | undefined
                      )
                    : currentAc.adapterConfig;
        }

        updatedAsset = {
            enabled: patch.enabled ?? currentAc.enabled,
            variants: patch.variants ?? currentAc.variants ?? getVariantDefinitions(project),
            maxUploadSizeMb: patch.maxUploadSizeMb ?? currentAc.maxUploadSizeMb,
            // null (or every kind) means no restriction.
            allowedTypes:
                patch.allowedTypes === undefined
                    ? currentAc.allowedTypes
                    : patch.allowedTypes &&
                        patch.allowedTypes.length < Object.keys(ALLOWED_MIME).length
                      ? patch.allowedTypes
                      : undefined,
            adapter: nextAdapter,
            adapterConfig: mergedAdapter as NonNullable<
                ProjectSchema['assetConfig']
            >['adapterConfig']
        };
    }

    const projectPatch: Partial<ProjectSchema> = {};
    if (updatedAsset !== undefined) {
        projectPatch.assetConfig = updatedAsset;
    }
    if (body.videoProviders !== undefined) {
        projectPatch.videoProviders = nextVideo;
    }

    if (Object.keys(projectPatch).length === 0) {
        return {
            assetConfig: await getAssetConfig(projectId, user),
            videoProviders: redactVideoProviders(project.videoProviders)
        };
    }

    await updateProject(user, projectId, projectPatch);

    const next = await getProject(user, projectId);
    return {
        assetConfig: await getAssetConfig(projectId, user),
        videoProviders: redactVideoProviders(next.videoProviders)
    };
}

/** Moves the project's videos to where new ones go (see `moveVideosToHost`). Admins. */
export async function moveProjectVideos(
    projectId: string,
    user: User,
    body: { removeFromOld?: boolean } = {}
) {
    assertAdmin(user);
    return moveVideosToHost(projectId, user, { removeFromOld: body.removeFromOld === true });
}
