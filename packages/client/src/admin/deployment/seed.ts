import type { MoteurClient } from '../../client.js';

/** Copy blueprint seeds into the deployment (server route documented in OpenAPI). */
export function deploymentSeedApi(client: MoteurClient) {
    return {
        run(options?: { force?: boolean }): Promise<{ copied: string[]; skipped: string[] }> {
            return client.post('/studio/seed', options ?? {});
        }
    };
}
