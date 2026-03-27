import type { MoteurClient } from '../../client.js';

/** Migrate assets between storage providers (server route documented in OpenAPI). */
export function deploymentMigrateAssetsApi(client: MoteurClient) {
    return {
        migrateProvider(body: {
            toProvider: string;
            fromProvider?: string;
            projectIds?: string[];
            keepLocalCopy?: boolean;
        }): Promise<Record<string, unknown>> {
            return client.post('/studio/assets/migrate-provider', body);
        }
    };
}
