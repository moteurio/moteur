/** Channel definition CRUD under `/projects/:id/channels` (JWT for writes; list/get also work with API key). */
import type { MoteurClient } from '../client.js';

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/channels`;

export function projectChannelsApi(client: MoteurClient) {
    return {
        list(projectId: string): Promise<{ channels: Record<string, unknown>[] }> {
            return client.get(base(projectId));
        },
        get(projectId: string, channelId: string): Promise<{ channel: Record<string, unknown> }> {
            return client.get(`${base(projectId)}/${encodeURIComponent(channelId)}`);
        },
        create(
            projectId: string,
            body: Record<string, unknown>
        ): Promise<{ channel: Record<string, unknown> }> {
            return client.post(base(projectId), body);
        },
        update(
            projectId: string,
            channelId: string,
            body: Record<string, unknown>
        ): Promise<{ channel: Record<string, unknown> }> {
            return client.patch(`${base(projectId)}/${encodeURIComponent(channelId)}`, body);
        },
        delete(projectId: string, channelId: string): Promise<void> {
            return client.delete(`${base(projectId)}/${encodeURIComponent(channelId)}`);
        }
    };
}
