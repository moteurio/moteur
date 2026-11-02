/**
 * The embed block (`play/oembed`) on a site. The engine resolves the link when the channel sends
 * the block (`data.embed`), so the page makes no call of its own.
 *
 * - A video or player that is one frame (YouTube, Vimeo, Spotify…): the frame is built here,
 *   with a title, lazily loaded, never the provider's HTML.
 * - Anything else (a post on X, a link no provider embeds): a link card, with the picture when
 *   there is one. `trustProviderHtml: true` inserts the provider's own HTML instead.
 *
 * - `render(block, locale)` returns HTML, for a block registry or server rendering;
 * - `<moteur-oembed>` draws the same in the browser from its `data` (a property, or JSON).
 */

/** A block as channels deliver it. */
export type OembedBlock = { type?: string; data?: OembedBlockData };

export type OembedBlockData = {
    url?: string;
    caption?: Localized;
    /** Width hint, in pixels. */
    maxWidth?: number;
    /** Added by the engine when the channel sends the block. */
    embed?: Embed;
};

export type Embed = {
    iframe?: { src: string; width?: number; height?: number; allow?: string };
    html?: string;
    title?: string;
    author_name?: string;
    provider_name?: string;
    thumbnail_url?: string;
    width?: number;
    height?: number;
};

export type Localized = string | Record<string, string | undefined> | undefined;

export type OembedOptions = {
    /** Insert the provider's HTML (often a script) when there is no frame. Off: a link card. */
    trustProviderHtml?: boolean;
};

const escapeHtml = (s: string) =>
    s.replace(
        /[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
    );

export function pick(value: Localized, locale?: string): string {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return '';
    const own = locale ? value[locale] : undefined;
    if (typeof own === 'string' && own) return own;
    return Object.values(value).find((v): v is string => typeof v === 'string' && v !== '') ?? '';
}

const https = (s: unknown): s is string => typeof s === 'string' && /^https:\/\//i.test(s);
const web = (s: unknown): s is string => typeof s === 'string' && /^https?:\/\//i.test(s);
const positive = (n: unknown) =>
    typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined;

function frame(embed: Embed, label: string): string {
    const f = embed.iframe!;
    const w = positive(f.width) ?? positive(embed.width);
    const h = positive(f.height) ?? positive(embed.height);
    // The frame keeps the provider's shape at any width.
    const ratio = w && h ? ` style="aspect-ratio: ${w} / ${h}; width: 100%; height: auto"` : '';
    return (
        `<iframe src="${escapeHtml(f.src)}" title="${escapeHtml(label)}" loading="lazy" ` +
        `referrerpolicy="strict-origin-when-cross-origin" allowfullscreen` +
        (f.allow ? ` allow="${escapeHtml(f.allow)}"` : '') +
        (w ? ` width="${w}"` : '') +
        (h ? ` height="${h}"` : '') +
        `${ratio}></iframe>`
    );
}

function card(url: string, embed: Embed | undefined, label: string): string {
    const picture = https(embed?.thumbnail_url)
        ? `<img src="${escapeHtml(embed!.thumbnail_url!)}" alt="" loading="lazy">`
        : '';
    const by = [embed?.author_name, embed?.provider_name].filter(Boolean).join(' · ');
    return (
        `<a class="moteur-oembed__card" href="${escapeHtml(url)}" rel="noopener">${picture}` +
        `<span class="moteur-oembed__title">${escapeHtml(label)}</span>` +
        (by ? `<span class="moteur-oembed__by">${escapeHtml(by)}</span>` : '') +
        `</a>`
    );
}

/** The block as HTML. Empty without a web link. */
export function renderOembed(
    data: OembedBlockData | undefined,
    locale?: string,
    options: OembedOptions = {}
): string {
    const url = data?.url?.trim();
    if (!web(url)) return '';
    const embed = data?.embed;
    const caption = pick(data?.caption, locale).trim();
    const label = embed?.title?.trim() || caption || url;
    const body =
        embed?.iframe && https(embed.iframe.src)
            ? frame(embed, label)
            : options.trustProviderHtml && embed?.html
              ? embed.html
              : card(url, embed, label);
    const width = positive(data?.maxWidth);
    return (
        `<figure class="moteur-oembed"${width ? ` style="max-width: ${width}px"` : ''}>${body}` +
        (caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : '') +
        `</figure>`
    );
}

/** For a block registry: `createBlockRegistry({ load: () => import('@moteurio/frontend-plugin-oembed') })`. */
export function render(block: OembedBlock, locale: string): string {
    return renderOembed(block?.data, locale);
}

/**
 * `<moteur-oembed>`: set `el.data = block.data` (or a `data` attribute holding it as JSON),
 * `locale`, and `trust-provider-html` to insert the provider's HTML.
 */
export function registerMoteurOembedElement(): void {
    if (typeof customElements === 'undefined' || customElements.get('moteur-oembed')) return;

    class MoteurOembed extends HTMLElement {
        #data: OembedBlockData | undefined;

        static get observedAttributes() {
            return ['data', 'locale', 'trust-provider-html'];
        }

        get data(): OembedBlockData | undefined {
            return this.#data;
        }

        set data(value: OembedBlockData | undefined) {
            this.#data = value;
            if (this.isConnected) this.draw();
        }

        connectedCallback() {
            this.draw();
        }

        attributeChangedCallback(name: string) {
            if (name === 'data') {
                try {
                    this.#data = JSON.parse(this.getAttribute('data') ?? 'null') ?? undefined;
                } catch {
                    this.#data = undefined;
                }
            }
            if (this.isConnected) this.draw();
        }

        draw() {
            this.innerHTML = renderOembed(this.#data, this.getAttribute('locale') ?? undefined, {
                trustProviderHtml: this.hasAttribute('trust-provider-html')
            });
            // HTML inserted with innerHTML never runs its scripts: run the provider's, as it asked.
            if (this.hasAttribute('trust-provider-html')) {
                for (const old of this.querySelectorAll('script')) {
                    const run = document.createElement('script');
                    for (const a of old.attributes) run.setAttribute(a.name, a.value);
                    run.text = old.text;
                    old.replaceWith(run);
                }
            }
        }
    }

    customElements.define('moteur-oembed', MoteurOembed);
}
