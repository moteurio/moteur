import type { MoteurClient } from '../client.js';

const root = (projectId: string) => `/projects/${encodeURIComponent(projectId)}`;

/**
 * Read-only page outputs: sitemap, resolved URLs, navigation tree, breadcrumb.
 * These are separate from operator `navigations` CRUD (`/projects/:id/navigations`).
 */
export function publicSiteOutputsApi(client: MoteurClient, projectId: string) {
    const base = root(projectId);
    return {
        sitemapXml(): Promise<string> {
            return client.request<string>({
                url: `${base}/sitemap.xml`,
                method: 'GET',
                responseType: 'text'
            });
        },
        sitemapJson(): Promise<unknown> {
            return client.get(`${base}/sitemap.json`);
        },
        /** Published navigation tree (`GET .../navigation`), not navigation documents CRUD. */
        navigation(options?: { depth?: number; rootId?: string | null }): Promise<unknown> {
            const q: Record<string, string | number> = {};
            if (options?.depth != null) q.depth = options.depth;
            if (options?.rootId !== undefined) {
                q.rootId =
                    options.rootId === null || options.rootId === ''
                        ? 'null'
                        : String(options.rootId);
            }
            return client.get(`${base}/navigation`, q as Record<string, string>);
        },
        urls(): Promise<unknown> {
            return client.get(`${base}/urls`);
        },
        breadcrumb(options: { pageId: string; entryId?: string }): Promise<unknown> {
            const q: Record<string, string> = { pageId: options.pageId };
            if (options.entryId) q.entryId = options.entryId;
            return client.get(`${base}/breadcrumb`, q);
        }
    };
}
