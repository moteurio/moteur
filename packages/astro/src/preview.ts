/**
 * Drafts on a static site: one on-demand route renders a page as it is now, through the same
 * views as the built site. Studio's Preview opens it with a short-lived token.
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

/** What `previewPage` reads of Astro's global. */
type AstroLike = { url: URL; response: { headers: Headers } };

export type PreviewOptions<S extends SchemaShape> = {
    /** The client to read with (default: `createMoteur()`, from `MOTEUR_API_KEY`). */
    client?: MoteurPublicClient<S>;
    /** Where the preview route lives (default `/preview`; Astro skips folders starting with `_`). */
    base?: string;
    /** Pictures come with their files and sizes, as the loaders give them (default true). */
    resolveAssets?: boolean;
};

const status = (err: unknown) => (err as { status?: number }).status;

/**
 * The page at this address, drafts included, shaped as the `moteurPages` loader shapes it, so
 * `views.for(page)` renders it. Null without a token, with an expired one, or when no page lives
 * at the address. The answer is never cached, never indexed, and never sends its address on.
 */
export async function previewPage<S extends SchemaShape>(
    astro: AstroLike,
    options: PreviewOptions<S> = {}
): Promise<SitePage<S> | null> {
    astro.response.headers.set('Cache-Control', 'private, no-store');
    astro.response.headers.set('X-Robots-Tag', 'noindex');
    // The token is in the address: never sent on to the page's fonts, analytics or links.
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
        // An expired or unknown token: the link is stale, not the site broken.
        if (status(err) === 401 || status(err) === 403) return null;
        throw err;
    }
}
