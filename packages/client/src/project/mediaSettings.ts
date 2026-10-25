import type { AssetType } from '@moteurio/types/Asset.js';
import type { ProjectSchema, VideoProvidersConfig } from '@moteurio/types/Project.js';
import type { VariantDefinition } from '@moteurio/types/VariantDefinition.js';
import type { MoteurClient } from '../client.js';

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/media-settings`;

type AssetConfig = NonNullable<ProjectSchema['assetConfig']>;

/** A project's media settings, secrets shown as `***`, with what the server offers. */
export type MediaSettings = {
    assetConfig: AssetConfig;
    videoProviders?: VideoProvidersConfig;
    /** Storages this server can use, e.g. `local`, `s3`. */
    storages: string[];
    /** Video hosts this server can send videos to. */
    videoHosts: string[];
    /** Files kept on the project's storage: to change storage, they are moved. */
    storedFiles: number;
    /**
     * Where the videos are: per host (`mux`…) or `local` (this server), how many, and how many
     * have a copy here (those can move). Videos in the bin aren't counted.
     */
    videos: Record<string, { count: number; withCopy: number }>;
    defaults: {
        maxUploadSizeMb: number;
        variants: VariantDefinition[];
        types: AssetType[];
        presets?: { id: string; label: string; variants: VariantDefinition[] }[];
    };
};

export type MediaSettingsUpdate = {
    assetConfig?: Partial<AssetConfig>;
    videoProviders?: VideoProvidersConfig | null;
};

export type StorageSettings = { adapter: string; adapterConfig?: Record<string, unknown> };

export function projectMediaSettingsApi(client: MoteurClient) {
    return {
        get(projectId: string): Promise<MediaSettings> {
            return client.get(base(projectId));
        },
        update(
            projectId: string,
            body: MediaSettingsUpdate
        ): Promise<Pick<MediaSettings, 'assetConfig' | 'videoProviders'>> {
            return client.patch(base(projectId), body);
        },
        /** Writes, reads back and deletes a small file with these settings, before saving them. */
        checkStorage(
            projectId: string,
            body: StorageSettings
        ): Promise<{ ok: boolean; error?: string }> {
            return client.post(`${base(projectId)}/check-storage`, body);
        },
        /** Copies every file to this storage, then switches to it. */
        moveStorage(projectId: string, body: StorageSettings): Promise<{ moved: number }> {
            return client.post(`${base(projectId)}/move-storage`, body);
        },
        /**
         * Moves the videos to where new ones go (the project's host, or this server), in the
         * background. `removeFromOld`: delete each at its old host once ready at the new one.
         */
        moveVideos(
            projectId: string,
            body: { removeFromOld?: boolean } = {}
        ): Promise<{ to: string; moving: number; staying: number }> {
            return client.post(`${base(projectId)}/move-videos`, body);
        },
        /** Forgets a video host's keys (refused while videos are there, or for the host in use). */
        forgetVideoHost(
            projectId: string,
            host: string
        ): Promise<{ videoProviders?: VideoProvidersConfig }> {
            return client.delete(`${base(projectId)}/video-hosts/${encodeURIComponent(host)}`);
        }
    };
}
