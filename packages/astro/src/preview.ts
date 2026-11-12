/**
 * Draft previews on a static site. One on-demand route renders the current draft of a page through
 * the same views as the built site. The preview link carries a short-lived token.
 *
 *     // src/pages/preview/[...path].astro
 *     export const prerender = false;
 *     const page = await previewPage<MoteurSchema>(Astro);
 *     if (!page) return new Response('This preview link has expired.', { status: 404 });
 *     const View = views.for(page)!;
 *     <View page={page} />
 */
import type { DeliveredPage, MoteurPublicClient, SchemaShape } from '@moteurio/client';
import { createMoteur } from './index.js';
import type { SitePage } from './templates.js';

/** The part of Astro's global object that `previewPage` reads. */
type AstroLike = { url: URL; response: { headers: Headers } };

export type PreviewOptions<S extends SchemaShape> = {
    /** The client to read with. Defaults to `createMoteur()`, which uses `MOTEUR_API_KEY`. */
    client?: MoteurPublicClient<S>;
    /** The path of the preview route. Defaults to `/preview`. Astro skips folders whose names start with `_`. */
    base?: string;
    /** Includes each picture's files and sizes, as the loaders do. Defaults to true. */
    resolveAssets?: boolean;
};

const status = (err: unknown) => (err as { status?: number }).status;

/**
 * Returns the page at the current URL, including its drafts, in the same shape that the
 * `moteurPages` loader produces, so `views.for(page)` can render it. It returns null when there is
 * no token, the token has expired, or no page exists at that URL. The response is never cached or
 * indexed, and the URL is not passed on to other sites as a referrer.
 */
export async function previewPage<S extends SchemaShape>(
    astro: AstroLike,
    options: PreviewOptions<S> = {}
): Promise<SitePage<S> | null> {
    astro.response.headers.set('Cache-Control', 'private, no-store');
    astro.response.headers.set('X-Robots-Tag', 'noindex');
    // The token is in the URL, so keep it from reaching the page's fonts, analytics and outgoing links.
    astro.response.headers.set('Referrer-Policy', 'no-referrer');
    const token = astro.url.searchParams.get('preview');
    if (!token) return null;
    const base = (options.base ?? '/preview').replace(/\/$/, '');
    const rest = astro.url.pathname.slice(base.length).replace(/\/$/, '');
    const path = rest || '/';
    const client = (options.client ?? createMoteur<S>()).withPreview(token);
    const channel = client.channel();
    try {
        for (const locale of (await channel.schema()).locales) {
            const pages = (await channel.pages.list({
                locale,
                resolveAssets: options.resolveAssets ?? true
            })) as DeliveredPage[];
            const page = pages.find(p => p.path === path);
            if (page) return { ...page, locale } as unknown as SitePage<S>;
        }
        return null;
    } catch (err) {
        // An expired or unknown token means the preview link is stale, which is not a site error.
        if (status(err) === 401 || status(err) === 403) return null;
        throw err;
    }
}
