/**
 * Single write path for admin Media Settings: assetConfig + videoProviders.
 * Empty or *** incoming values for credentials keep existing stored values.
 */
import type { User } from '@moteurio/types/User.js';
import type { ProjectSchema, VideoProvidersConfig } from '@moteurio/types/Project.js';
import { getProject, updateProject } from '../projects.js';
import { getAssetConfig } from './assetService.js';
import { getVariantDefinitions } from './defaultVariants.js';

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

function clearedVideoProviders(
    keepLocalCopy: boolean,
    active: VideoProvidersConfig['active']
): VideoProvidersConfig {
    return {
        active,
        keepLocalCopy,
        mux: undefined,
        vimeo: undefined,
        cloudflareStream: undefined,
        youtube: undefined
    };
}

export function mergeVideoProvidersPayload(
    current: VideoProvidersConfig | undefined,
    incoming: VideoProvidersConfig | undefined
): VideoProvidersConfig | undefined {
    if (incoming === undefined) return current;
    const keepLocalCopy = incoming.keepLocalCopy ?? current?.keepLocalCopy ?? false;
    const active = incoming.active;

    if (!active) {
        return clearedVideoProviders(keepLocalCopy, undefined);
    }

    if (active === 'mux') {
        return {
            ...clearedVideoProviders(keepLocalCopy, 'mux'),
            mux: mergeMux(current?.mux, incoming.mux)
        };
    }

    if (active === 'vimeo') {
        return {
            ...clearedVideoProviders(keepLocalCopy, 'vimeo'),
            vimeo: mergeVimeo(current?.vimeo, incoming.vimeo)
        };
    }

    if (active === 'cloudflare-stream') {
        return {
            ...clearedVideoProviders(keepLocalCopy, 'cloudflare-stream'),
            cloudflareStream: mergeCloudflareStream(
                current?.cloudflareStream,
                incoming.cloudflareStream
            )
        };
    }

    if (active === 'youtube') {
        return {
            ...clearedVideoProviders(keepLocalCopy, 'youtube'),
            youtube: mergeYoutube(current?.youtube, incoming.youtube)
        };
    }

    return current;
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
    const project = await getProject(user, projectId);
    const currentAc: Partial<NonNullable<ProjectSchema['assetConfig']>> = project.assetConfig ?? {};
    const patch = body.assetConfig;

    let nextVideo = project.videoProviders;
    if (body.videoProviders === null) {
        nextVideo = undefined;
    } else if (body.videoProviders !== undefined) {
        nextVideo = mergeVideoProvidersPayload(project.videoProviders, body.videoProviders);
        validateMergedVideoProviders(nextVideo);
    }

    let updatedAsset: NonNullable<ProjectSchema['assetConfig']> | undefined;

    if (patch !== undefined) {
        if (patch.variants) {
            const keys = new Set<string>();
            for (const v of patch.variants) {
                if (v.key === 'original') throw new Error("Variant key 'original' is reserved");
                if (keys.has(v.key)) throw new Error(`Duplicate variant key: ${v.key}`);
                keys.add(v.key);
            }
        }
        const nextAdapter = patch.adapter ?? currentAc.adapter ?? 'local';
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
            allowedTypes:
                patch.allowedTypes !== undefined ? patch.allowedTypes : currentAc.allowedTypes,
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
            videoProviders: project.videoProviders
        };
    }

    await updateProject(user, projectId, projectPatch);

    const next = await getProject(user, projectId);
    return {
        assetConfig: await getAssetConfig(projectId, user),
        videoProviders: next.videoProviders
    };
}
