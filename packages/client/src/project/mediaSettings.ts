import type { AssetType } from '@moteurio/types/Asset.js';
import type { ProjectSchema, VideoProvidersConfig } from '@moteurio/types/Project.js';
import type { VariantDefinition } from '@moteurio/types/VariantDefinition.js';
import type { MoteurClient } from '../client.js';

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/media-settings`;

type AssetConfig = NonNullable<ProjectSchema['assetConfig']>;

/** A project's media settings, with secrets shown as `***`, and the options the server offers. */
export type MediaSettings = {
    assetConfig: AssetConfig;
    videoProviders?: VideoProvidersConfig;
    /** Storage adapters this server supports, for example `local` or `s3`. */
    storages: string[];
    /** Video hosts this server can upload videos to. */
    videoHosts: string[];
    /** Number of files on the project's storage. Changing storage moves these files. */
    storedFiles: number;
    /**
     * Video counts by location: a host such as `mux`, or `local` for this server. `count` is the
     * number of videos there, and `withCopy` is how many of them also have a copy on this server
     * (only those can be moved). Videos in the bin are not counted.
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
        /** Tests the storage settings before they are saved, by writing, reading back and deleting a small file. */
        checkStorage(
            projectId: string,
            body: StorageSettings
        ): Promise<{ ok: boolean; error?: string }> {
            return client.post(`${base(projectId)}/check-storage`, body);
        },
        /** Copies every file to the given storage, then switches the project to it. */
        moveStorage(projectId: string, body: StorageSettings): Promise<{ moved: number }> {
            return client.post(`${base(projectId)}/move-storage`, body);
        },
        /**
         * Moves the videos, in the background, to the location where new videos are stored (the
         * project's video host, or this server). With `removeFromOld`, each video is deleted from
         * its old host once it is ready at the new one.
         */
        moveVideos(
            projectId: string,
            body: { removeFromOld?: boolean } = {}
        ): Promise<{ to: string; moving: number; staying: number }> {
            return client.post(`${base(projectId)}/move-videos`, body);
        },
        /** Removes a video host's stored credentials. Refused while videos are still on that host, or while it is the active host. */
        forgetVideoHost(
            projectId: string,
            host: string
        ): Promise<{ videoProviders?: VideoProvidersConfig }> {
            return client.delete(`${base(projectId)}/video-hosts/${encodeURIComponent(host)}`);
        }
    };
}
