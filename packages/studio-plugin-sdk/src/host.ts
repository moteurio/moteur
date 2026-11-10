import type { StudioHostConfig } from './types.js';

let hostConfig: StudioHostConfig = { publicApiUrl: '' };

/** Configures the Studio host. Call it once at Studio startup, whether in a hosted or a self-hosted build. */
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
