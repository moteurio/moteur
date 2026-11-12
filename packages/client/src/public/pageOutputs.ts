import type { Redirect } from '@moteurio/types/Redirect.js';
import type { MoteurClient } from '../client.js';

const root = (projectId: string) => `/projects/${encodeURIComponent(projectId)}`;

/** The result of resolving a path: a page or entry in one locale, or a redirect to follow. */
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

/** The URL of a page or entry in one locale, together with its URLs in the other locales. */
export type SiteUrl = {
    url: string;
    nodeId: string;
    nodeType: 'static' | 'collection' | 'folder';
    label: string;
    navInclude: boolean;
    navLabel?: string;
    sitemapInclude: boolean;
    sitemapPriority: number;
    sitemapChangefreq?: string;
    entryId?: string;
    modelId?: string;
    locale?: string;
    /** URLs of the same page or entry in every locale, keyed by locale code. This URL is included. */
    alternates?: Record<string, string>;
};

export type NavigationNode = {
    id: string;
    label: string;
    url: string;
    type: 'static' | 'collection' | 'folder';
    children?: NavigationNode[];
};

export type BreadcrumbItem = { label: string; url: string; nodeId: string; entryId?: string };

/**
 * Read-only page outputs: sitemap, resolved URLs, navigation tree, breadcrumb, path lookup and
 * redirects. These are separate from the authenticated CRUD API for navigations
 * (`/projects/:id/navigations`). `locale` selects the locale of the results, and each URL carries
 * its `alternates` for the other locales.
 */
export function publicSiteOutputsApi(client: MoteurClient, projectId: string, language?: string) {
    const base = root(projectId);
    /** Returns the `locale` query parameter, using the call's locale or else the client's. */
    const inLocale = (locale?: string): Record<string, string> => {
        const lang = locale ?? language;
        return lang ? { locale: lang } : {};
    };
    return {
        sitemapXml(): Promise<string> {
            return client.request<string>({
                url: `${base}/sitemap.xml`,
                method: 'GET',
                responseType: 'text'
            });
        },
        sitemapJson(options?: { locale?: string }): Promise<SiteUrl[]> {
            return client.get(`${base}/sitemap.json`, inLocale(options?.locale));
        },
        /** Returns the published navigation tree (`GET .../navigation`), not the navigation documents managed through the CRUD API. */
        navigation(options?: {
            depth?: number;
            rootId?: string | null;
            locale?: string;
        }): Promise<NavigationNode[]> {
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
        urls(options?: { locale?: string }): Promise<SiteUrl[]> {
            return client.get(`${base}/urls`, inLocale(options?.locale));
        },
        breadcrumb(options: {
            pageId: string;
            entryId?: string;
            locale?: string;
        }): Promise<{ url: string; breadcrumb: BreadcrumbItem[] }> {
            const q: Record<string, string> = {
                pageId: options.pageId,
                ...inLocale(options.locale)
            };
            if (options.entryId) q.entryId = options.entryId;
            return client.get(`${base}/breadcrumb`, q);
        },
        /** Resolves a path to the page, entry or redirect at that path, for use in a catch-all route. Returns null when nothing matches. */
        async resolve(path: string): Promise<ResolvedPath | null> {
            try {
                return await client.get<ResolvedPath>(`${base}/resolve`, { path });
            } catch (err) {
                if ((err as { status?: number }).status === 404) return null;
                throw err;
            }
        },
        /** Returns the redirects (old paths and their destinations) for the site or its host to apply. */
        redirects(): Promise<Redirect[]> {
            return client.get(`${base}/redirects`);
        }
    };
}
