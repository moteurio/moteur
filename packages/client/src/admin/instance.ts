import type { MoteurClient } from '../client.js';
import { deploymentUsageApi } from './deployment/usage.js';
import { deploymentSeedApi } from './deployment/seed.js';
import { deploymentMigrateAssetsApi } from './deployment/migrate.js';

/**
 * Deployment-wide maintenance: usage counters, blueprint seeding, asset migration.
 * Exposed as `client.instance` on the admin client (operator-oriented; see REST API for auth).
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
            projectIds?: string[];
            keepLocalCopy?: boolean;
        }) => migrate.migrateProvider(body)
    };
}
