/** Project pages API (`/projects/:id/pages`). For the published navigation tree use the public client’s `site.navigation`. */
import type { MoteurClient } from '../client.js';

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/pages`;

export function projectPagesApi(client: MoteurClient) {
    return {
        list(projectId: string): Promise<{ pages: Record<string, unknown>[] }> {
            return client
                .get<
                    Record<string, unknown>[] | { pages: Record<string, unknown>[] }
                >(base(projectId))
                .then(data =>
                    Array.isArray(data)
                        ? { pages: data }
                        : (data as { pages: Record<string, unknown>[] })
                );
        },
        get(projectId: string, pageId: string): Promise<{ page: Record<string, unknown> }> {
            return client.get(`${base(projectId)}/${encodeURIComponent(pageId)}`);
        },
        getBySlug(projectId: string, slug: string): Promise<{ page: Record<string, unknown> }> {
            return client.get(`${base(projectId)}/by-slug/${encodeURIComponent(slug)}`);
        },
        create(
            projectId: string,
            body: Record<string, unknown>
        ): Promise<{ page: Record<string, unknown> }> {
            return client.post(base(projectId), body);
        },
        update(
            projectId: string,
            pageId: string,
            body: Record<string, unknown>
        ): Promise<{ page: Record<string, unknown> }> {
            return client.patch(`${base(projectId)}/${encodeURIComponent(pageId)}`, body);
        },
        delete(projectId: string, pageId: string): Promise<void> {
            return client.delete(`${base(projectId)}/${encodeURIComponent(pageId)}`);
        },
        status(
            projectId: string,
            pageId: string,
            status: string
        ): Promise<{ page: Record<string, unknown> }> {
            return client.patch(`${base(projectId)}/${encodeURIComponent(pageId)}/status`, {
                status
            });
        },
        submitReview(
            projectId: string,
            pageId: string
        ): Promise<{ page: Record<string, unknown> }> {
            return client.post(`${base(projectId)}/${encodeURIComponent(pageId)}/submit-review`);
        }
    };
}
