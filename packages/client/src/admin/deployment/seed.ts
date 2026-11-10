import type { MoteurClient } from '../../client.js';

/** Copies blueprint seeds into the deployment. The server route is documented in the OpenAPI document. */
export function deploymentSeedApi(client: MoteurClient) {
    return {
        run(options?: { force?: boolean }): Promise<{ copied: string[]; skipped: string[] }> {
            return client.post('/studio/seed', options ?? {});
        }
    };
}
