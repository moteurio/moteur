import type { MoteurClient } from '../../client.js';

/** Deployment-wide request counters (server route documented in OpenAPI). */
export function deploymentUsageApi(client: MoteurClient) {
    return {
        get(): Promise<Record<string, unknown>> {
            return client.get('/studio/usage');
        }
    };
}
