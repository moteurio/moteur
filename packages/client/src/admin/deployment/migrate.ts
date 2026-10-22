import type { MoteurClient } from '../../client.js';

/**
 * Moves videos to another host, project by project (admins of each). Deprecated: prefer
 * `forProject(id).mediaSettings.moveVideos()`.
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
