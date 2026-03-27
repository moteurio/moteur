import type { MoteurClient } from '../client.js';

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/navigations`;

export function projectNavigationsApi(client: MoteurClient) {
    return {
        list(projectId: string): Promise<{ navigations: Record<string, unknown>[] }> {
            return client
                .get<
                    Record<string, unknown>[] | { navigations: Record<string, unknown>[] }
                >(base(projectId))
                .then(data =>
                    Array.isArray(data)
                        ? { navigations: data }
                        : (data as { navigations: Record<string, unknown>[] })
                );
        },
        get(
            projectId: string,
            navigationId: string
        ): Promise<{ navigation: Record<string, unknown> }> {
            return client.get(`${base(projectId)}/${encodeURIComponent(navigationId)}`);
        },
        create(
            projectId: string,
            body: Record<string, unknown>
        ): Promise<{ navigation: Record<string, unknown> }> {
            return client.post(base(projectId), body);
        },
        update(
            projectId: string,
            navigationId: string,
            body: Record<string, unknown>
        ): Promise<{ navigation: Record<string, unknown> }> {
            return client.patch(`${base(projectId)}/${encodeURIComponent(navigationId)}`, body);
        },
        delete(projectId: string, navigationId: string): Promise<void> {
            return client.delete(`${base(projectId)}/${encodeURIComponent(navigationId)}`);
        }
    };
}
