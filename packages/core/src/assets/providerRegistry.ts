import type { VideoProviderId } from '@moteurio/types/Asset.js';
import type { VideoProvider } from './VideoProvider.js';
import type { VideoProvidersConfig } from '@moteurio/types/Project.js';
import { getProjectById } from '../projects.js';

const providers = new Map<VideoProviderId, VideoProvider>();

export type VideoProviderFactory = (config: unknown) => VideoProvider;
const providerFactories = new Map<VideoProviderId, VideoProviderFactory>();

let instanceConfig: VideoProvidersConfig | null = null;

export function registerProvider(provider: VideoProvider): void {
    providers.set(provider.id, provider);
}

/** Register a factory for a video provider (e.g. mux, vimeo). Used by plugins. */
export function registerProviderFactory(id: VideoProviderId, factory: VideoProviderFactory): void {
    providerFactories.set(id, factory);
}

export function getProvider(id: VideoProviderId): VideoProvider | null {
    return providers.get(id) ?? null;
}

function getCredsForProvider(
    vp: VideoProvidersConfig | undefined,
    providerId: VideoProviderId
): unknown {
    if (!vp) return undefined;
    switch (providerId) {
        case 'mux':
            return vp.mux;
        case 'vimeo':
            return vp.vimeo;
        case 'cloudflare-stream':
            return vp.cloudflareStream;
        case 'youtube':
            return vp.youtube;
        default:
            return undefined;
    }
}

export function setVideoProvidersConfig(config: VideoProvidersConfig | null): void {
    instanceConfig = config;
    if (!config) return;
    if (config.mux) {
        const factory = providerFactories.get('mux');
        if (factory) {
            try {
                registerProvider(factory(config.mux));
            } catch {
                // plugin failed to create provider
            }
        }
    }
    if (config.vimeo) {
        const factory = providerFactories.get('vimeo');
        if (factory) {
            try {
                registerProvider(factory(config.vimeo));
            } catch {
                // plugin failed to create provider
            }
        }
    }
    if (config.cloudflareStream) {
        const factory = providerFactories.get('cloudflare-stream');
        if (factory) {
            try {
                registerProvider(factory(config.cloudflareStream));
            } catch {
                // plugin failed to create provider
            }
        }
    }
    if (config.youtube) {
        const factory = providerFactories.get('youtube');
        if (factory) {
            try {
                registerProvider(factory(config.youtube));
            } catch {
                // plugin failed to create provider
            }
        }
    }
}

export function getVideoProvidersConfig(): VideoProvidersConfig | null {
    return instanceConfig;
}

/** Returns the global active provider (instance-level config). Prefer getActiveProviderForProject when you have a projectId. */
export function getActiveProvider(): VideoProvider | null {
    const id = instanceConfig?.active;
    if (!id) return null;
    return getProvider(id);
}

function createProvider(providerId: VideoProviderId, config: unknown): VideoProvider | null {
    const factory = providerFactories.get(providerId);
    if (!factory) return null;
    try {
        return factory(config);
    } catch {
        return null;
    }
}

/**
 * Returns the video provider for this project. Uses project.videoProviders when set, otherwise falls back to instance-level config.
 */
export async function getProviderForProject(
    projectId: string,
    providerId: VideoProviderId
): Promise<VideoProvider | null> {
    const project = await getProjectById(projectId);
    const projectConfig = project?.videoProviders;
    if (projectConfig) {
        const creds = getCredsForProvider(projectConfig, providerId);
        if (creds) return createProvider(providerId, creds) ?? null;
    }
    return getProvider(providerId);
}

/**
 * Returns the active video provider for this project (for uploads). Uses project.videoProviders when set, otherwise instance-level config.
 */
export async function getActiveProviderForProject(
    projectId: string
): Promise<VideoProvider | null> {
    const project = await getProjectById(projectId);
    const projectConfig = project?.videoProviders;
    const activeId = projectConfig?.active ?? instanceConfig?.active;
    if (!activeId) return null;
    return getProviderForProject(projectId, activeId);
}

/**
 * Returns project IDs that have the given provider configured with a webhook secret (for webhook signature verification).
 */
export async function getProjectIdsWithProviderSecret(
    providerId: VideoProviderId
): Promise<Array<{ projectId: string; secret: string }>> {
    const { loadProjects } = await import('../projects.js');
    const projects = loadProjects();
    const out: Array<{ projectId: string; secret: string }> = [];
    for (const p of projects) {
        const vp = p.videoProviders;
        const creds = getCredsForProvider(vp, providerId);
        const secret =
            creds && typeof creds === 'object' && creds !== null && 'webhookSecret' in creds
                ? (creds as { webhookSecret?: string }).webhookSecret
                : undefined;
        if (secret && typeof secret === 'string' && secret.trim()) {
            out.push({ projectId: p.id, secret });
        }
    }
    return out;
}

function minimalVerifyConfig(providerId: VideoProviderId, secret: string): unknown {
    switch (providerId) {
        case 'mux':
            return { tokenId: '', tokenSecret: '', webhookSecret: secret };
        case 'vimeo':
            return { accessToken: '', webhookSecret: secret };
        case 'cloudflare-stream':
            return { accountId: '', apiToken: '', webhookSecret: secret };
        default:
            return null;
    }
}

/**
 * Verify webhook signature against project-level provider secrets.
 * Returns the projectId and secret that matched.
 */
export async function verifyProviderWebhookAndGetProjectId(
    providerId: VideoProviderId,
    rawBody: string,
    signature: string
): Promise<{ projectId: string; secret: string } | null> {
    const candidates = await getProjectIdsWithProviderSecret(providerId);
    for (const { projectId, secret } of candidates) {
        const minimal = minimalVerifyConfig(providerId, secret);
        if (minimal == null) continue;
        const provider = createProvider(providerId, minimal);
        if (provider?.verifySignature(rawBody, signature, secret)) return { projectId, secret };
    }
    return null;
}
