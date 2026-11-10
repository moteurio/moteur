import type { MoteurClient } from '../../client.js';

/** Deployment-wide request counters. The server route is documented in the OpenAPI document. */
export function deploymentUsageApi(client: MoteurClient) {
    return {
        get(): Promise<Record<string, unknown>> {
            return client.get('/studio/usage');
        }
    };
}
