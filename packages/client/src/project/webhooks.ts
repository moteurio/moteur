import type { MoteurClient } from '../client.js';

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/webhooks`;

export function projectWebhooksApi(client: MoteurClient) {
    return {
        list(projectId: string): Promise<{ webhooks: Record<string, unknown>[] }> {
            return client
                .get<
                    Record<string, unknown>[] | { webhooks: Record<string, unknown>[] }
                >(base(projectId))
                .then(data =>
                    Array.isArray(data)
                        ? { webhooks: data }
                        : (data as { webhooks: Record<string, unknown>[] })
                );
        },
        get(projectId: string, webhookId: string): Promise<{ webhook: Record<string, unknown> }> {
            return client.get(`${base(projectId)}/${encodeURIComponent(webhookId)}`);
        },
        create(
            projectId: string,
            body: Record<string, unknown>
        ): Promise<{ webhook: Record<string, unknown> }> {
            return client.post(base(projectId), body);
        },
        update(
            projectId: string,
            webhookId: string,
            body: Record<string, unknown>
        ): Promise<{ webhook: Record<string, unknown> }> {
            return client.patch(`${base(projectId)}/${encodeURIComponent(webhookId)}`, body);
        },
        delete(projectId: string, webhookId: string): Promise<void> {
            return client.delete(`${base(projectId)}/${encodeURIComponent(webhookId)}`);
        },
        test(projectId: string, webhookId: string): Promise<{ ok: boolean; status?: number }> {
            return client.post(`${base(projectId)}/${encodeURIComponent(webhookId)}/test`);
        }
    };
}
