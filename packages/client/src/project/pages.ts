/** Project pages API (`/projects/:id/pages`). For the published navigation tree use the public client’s `site.navigation`. */
import type { MoteurClient } from '../client.js';

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/pages`;

type Page = Record<string, unknown>;

/** The API answers with the page itself; callers get it as `{ page }`. */
const wrap = (p: Promise<Page>): Promise<{ page: Page }> => p.then(page => ({ page }));

export type PageMove = { id: string; parentId: string | null; order: number };

export function projectPagesApi(client: MoteurClient) {
    return {
        list(projectId: string): Promise<{ pages: Page[] }> {
            return client
                .get<Page[] | { pages: Page[] }>(base(projectId))
                .then(data => (Array.isArray(data) ? { pages: data } : data));
        },
        get(projectId: string, pageId: string): Promise<{ page: Page }> {
            return wrap(client.get(`${base(projectId)}/${encodeURIComponent(pageId)}`));
        },
        getBySlug(projectId: string, slug: string): Promise<{ page: Page }> {
            return wrap(client.get(`${base(projectId)}/by-slug/${encodeURIComponent(slug)}`));
        },
        create(projectId: string, body: Record<string, unknown>): Promise<{ page: Page }> {
            return wrap(client.post(base(projectId), body));
        },
        update(
            projectId: string,
            pageId: string,
            body: Record<string, unknown>
        ): Promise<{ page: Page }> {
            return wrap(client.patch(`${base(projectId)}/${encodeURIComponent(pageId)}`, body));
        },
        /** Moves pages in the tree: each gets a parent (null for the top) and a position. */
        reorder(projectId: string, moves: PageMove[]): Promise<{ pages: Page[] }> {
            return client
                .post<Page[]>(`${base(projectId)}/reorder`, moves)
                .then(pages => ({ pages }));
        },
        delete(projectId: string, pageId: string): Promise<void> {
            return client.delete(`${base(projectId)}/${encodeURIComponent(pageId)}`);
        },
        status(projectId: string, pageId: string, status: string): Promise<{ page: Page }> {
            return wrap(
                client.patch(`${base(projectId)}/${encodeURIComponent(pageId)}/status`, {
                    status
                })
            );
        },
        submitReview(projectId: string, pageId: string): Promise<Record<string, unknown>> {
            return client.post(`${base(projectId)}/${encodeURIComponent(pageId)}/submit-review`);
        }
    };
}
