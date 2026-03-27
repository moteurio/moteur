import { createMoteurClientInternal } from '../client.js';
import { MoteurClientError } from '../credentials.js';
import { publicCollectionsReadApi } from './collectionsRead.js';
import { createPublicCollectionChannel } from './collectionChannel.js';
import { publicSiteOutputsApi } from './pageOutputs.js';
import { publicRadarApi } from './radar.js';
import type { MoteurPublicClientConfig } from '../types.js';

/**
 * Read-only SDK for a **project API key** (`x-api-key`) and fixed `projectId`.
 * Use `channel(collectionId)` for collection-shaped reads; `site` for sitemap / navigation tree / urls / breadcrumb.
 */
export function createMoteurPublicClient(config: MoteurPublicClientConfig) {
    const auth = config.auth;
    if (auth.type !== 'apiKey' || !auth.apiKey?.trim()) {
        throw new MoteurClientError({
            code: 'MOTEUR_E_PUBLIC_AUTH',
            message:
                'createMoteurPublicClient requires auth: { type: "apiKey", apiKey, projectId }',
            hint: 'Use createMoteurAdminClient with a JWT for the full API.'
        });
    }
    if (!auth.projectId?.trim()) {
        throw new MoteurClientError({
            code: 'MOTEUR_E_PUBLIC_AUTH',
            message: 'createMoteurPublicClient requires auth.projectId',
            hint: 'The public client is bound to one project; set auth.projectId.'
        });
    }

    const projectId = auth.projectId;
    const client = createMoteurClientInternal({
        baseURL: config.baseURL,
        auth: { type: 'apiKey', apiKey: auth.apiKey, projectId },
        timeout: config.timeout
    });

    const collectionsRead = publicCollectionsReadApi(client);
    const site = publicSiteOutputsApi(client, projectId);
    const radar = publicRadarApi(client, projectId);

    return {
        get baseURL() {
            return client.baseURL;
        },
        projectId,
        collections: {
            list: () => collectionsRead.list(projectId),
            get: (collectionId: string) => collectionsRead.get(projectId, collectionId)
        },
        channel: (collectionId: string) =>
            createPublicCollectionChannel(client, projectId, collectionId),
        site,
        radar
    };
}

export type MoteurPublicClient = ReturnType<typeof createMoteurPublicClient>;
