import type { MoteurClient } from '../client.js';

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/layouts`;

export function projectLayoutsApi(client: MoteurClient) {
    return {
        list(projectId: string): Promise<{ layouts: Record<string, unknown>[] }> {
            return client
                .get<
                    Record<string, unknown>[] | { layouts: Record<string, unknown>[] }
                >(base(projectId))
                .then(data =>
                    Array.isArray(data)
                        ? { layouts: data }
                        : (data as { layouts: Record<string, unknown>[] })
                );
        },
        get(projectId: string, layoutId: string): Promise<{ layout: Record<string, unknown> }> {
            return client.get(`${base(projectId)}/${encodeURIComponent(layoutId)}`);
        },
        create(
            projectId: string,
            body: Record<string, unknown>
        ): Promise<{ layout: Record<string, unknown> }> {
            return client.post(base(projectId), body);
        },
        update(
            projectId: string,
            layoutId: string,
            body: Record<string, unknown>
        ): Promise<{ layout: Record<string, unknown> }> {
            return client.patch(`${base(projectId)}/${encodeURIComponent(layoutId)}`, body);
        },
        delete(projectId: string, layoutId: string): Promise<void> {
            return client.delete(`${base(projectId)}/${encodeURIComponent(layoutId)}`);
        }
    };
}
