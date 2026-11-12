import type { MoteurClient } from '../../client.js';

/**
 * Moves videos to another host, one project at a time. Requires an admin of each project.
 * Deprecated: use `forProject(id).mediaSettings.moveVideos()` instead.
 */
export function deploymentMigrateAssetsApi(client: MoteurClient) {
    return {
        migrateProvider(body: {
            toProvider: string;
            fromProvider?: string;
            projectIds: string[];
            removeFromOld?: boolean;
        }): Promise<Record<string, unknown>> {
            return client.post('/studio/assets/migrate-provider', body);
        }
    };
}
