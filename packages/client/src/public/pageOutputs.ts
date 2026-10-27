import type { Redirect } from '@moteurio/types/Redirect.js';
import type { MoteurClient } from '../client.js';

const root = (projectId: string) => `/projects/${encodeURIComponent(projectId)}`;

/** What lives at a path: a page or entry in one language, or a redirect to follow. */
export type ResolvedPath =
    | {
          match: 'page';
          url: string;
          nodeId: string;
          nodeType: 'static' | 'collection' | 'folder';
          entryId?: string;
          modelId?: string;
          locale?: string;
          alternates?: Record<string, string>;
          [key: string]: unknown;
      }
    | { match: 'redirect'; from: string; to: string; status: 301 | 302 };

/** `{ locale }` as a query, when given. */
const inLocale = (locale?: string): Record<string, string> => (locale ? { locale } : {});

/**
 * Read-only page outputs: sitemap, resolved URLs, navigation tree, breadcrumb, path lookup and
 * redirects. These are separate from operator `navigations` CRUD (`/projects/:id/navigations`).
 * `locale` picks one language; addresses carry their `alternates` in the others.
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
        sitemapJson(options?: { locale?: string }): Promise<unknown> {
            return client.get(`${base}/sitemap.json`, inLocale(options?.locale));
        },
        /** Published navigation tree (`GET .../navigation`), not navigation documents CRUD. */
        navigation(options?: {
            depth?: number;
            rootId?: string | null;
            locale?: string;
        }): Promise<unknown> {
            const q: Record<string, string | number> = inLocale(options?.locale);
            if (options?.depth != null) q.depth = options.depth;
            if (options?.rootId !== undefined) {
                q.rootId =
                    options.rootId === null || options.rootId === ''
                        ? 'null'
                        : String(options.rootId);
            }
            return client.get(`${base}/navigation`, q as Record<string, string>);
        },
        urls(options?: { locale?: string }): Promise<unknown> {
            return client.get(`${base}/urls`, inLocale(options?.locale));
        },
        breadcrumb(options: {
            pageId: string;
            entryId?: string;
            locale?: string;
        }): Promise<unknown> {
            const q: Record<string, string> = {
                pageId: options.pageId,
                ...inLocale(options.locale)
            };
            if (options.entryId) q.entryId = options.entryId;
            return client.get(`${base}/breadcrumb`, q);
        },
        /** What lives at a path, for a catch-all route; null when nothing does. */
        async resolve(path: string): Promise<ResolvedPath | null> {
            try {
                return await client.get<ResolvedPath>(`${base}/resolve`, { path });
            } catch (err) {
                if ((err as { status?: number }).status === 404) return null;
                throw err;
            }
        },
        /** Old addresses and where they go, for the site or its host to apply. */
        redirects(): Promise<Redirect[]> {
            return client.get(`${base}/redirects`);
        }
    };
}
