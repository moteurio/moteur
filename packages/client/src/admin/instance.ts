import type { MoteurClient } from '../client.js';
import { deploymentUsageApi } from './deployment/usage.js';
import { deploymentSeedApi } from './deployment/seed.js';
import { deploymentMigrateAssetsApi } from './deployment/migrate.js';

/**
 * Deployment-wide maintenance: usage counters, blueprint seeding and asset migration.
 * Available as `client.instance` on the admin client. It is intended for operators; see the REST
 * API documentation for authentication.
 */
export function instanceApi(client: MoteurClient) {
    const usage = deploymentUsageApi(client);
    const seed = deploymentSeedApi(client);
    const migrate = deploymentMigrateAssetsApi(client);
    return {
        usage: () => usage.get(),
        seed,
        migrateProvider: (body: {
            toProvider: string;
            fromProvider?: string;
            projectIds: string[];
            removeFromOld?: boolean;
        }) => migrate.migrateProvider(body)
    };
}
