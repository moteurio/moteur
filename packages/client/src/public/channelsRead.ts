import type { MoteurClient } from '../client.js';

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/channels`;

/** List / get channel definitions (API key or JWT). */
export function publicChannelsReadApi(client: MoteurClient) {
    return {
        list(projectId: string): Promise<{ channels: Record<string, unknown>[] }> {
            return client.get(base(projectId));
        },
        get(projectId: string, channelId: string): Promise<{ channel: Record<string, unknown> }> {
            return client.get(`${base(projectId)}/${encodeURIComponent(channelId)}`);
        }
    };
}
