import type { StudioHostConfig } from './types.js';

let hostConfig: StudioHostConfig = { publicApiUrl: '' };

/** Called once at Studio startup (private host or self-hosted build). */
export function configureStudioHost(config: StudioHostConfig): void {
    hostConfig = {
        publicApiUrl: config.publicApiUrl.replace(/\/$/, ''),
        fetchProject: config.fetchProject,
        resolveAssetUrl: config.resolveAssetUrl
    };
}

export function getStudioHost(): StudioHostConfig {
    return hostConfig;
}
