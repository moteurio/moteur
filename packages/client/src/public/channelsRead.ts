import type { MoteurClient } from '../client.js';

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/channels`;

/** Lists and gets channel definitions. Works with an API key or a JWT. */
export function publicChannelsReadApi(client: MoteurClient) {
    return {
        list(projectId: string): Promise<Record<string, unknown>[]> {
            return client.get(base(projectId));
        },
        get(projectId: string, channelId: string): Promise<Record<string, unknown>> {
            return client.get(`${base(projectId)}/${encodeURIComponent(channelId)}`);
        }
    };
}
