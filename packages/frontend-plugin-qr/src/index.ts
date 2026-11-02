/**
 * The QR code block (`play/qr`) on a site: drawn from the block's own text, in the page itself.
 * No call to the API, no image to load: the code is an inline SVG, sharp at any size.
 *
 * - `render(block, locale)` returns HTML, for a block registry or server rendering;
 * - `<moteur-qr text="…" caption="…" size="…">` draws the same in the browser.
 *
 * A link (http, https, mailto, tel) is also a link on screen: someone reading the page on their
 * phone can't scan their own screen.
 */
import QRCode from 'qrcode';

/** A block as channels deliver it. */
export type QrBlock = { type?: string; data?: QrBlockData };

export type QrBlockData = {
    /** The `play/qr` field: `{ text }`, text in each language or in the one asked for. */
    payload?: { text?: Localized } | string;
    caption?: Localized;
};

/** A value in one language, or in each. */
export type Localized = string | Record<string, string | undefined> | undefined;

export type QrOptions = {
    /** Width and height in pixels (256). */
    size?: number;
    /** Quiet zone around the code, in modules (2, as the field's default). */
    margin?: number;
};

const escapeHtml = (s: string) =>
    s.replace(
        /[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
    );

/** The text in `locale`, else the first one there is. */
export function pick(value: Localized, locale?: string): string {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return '';
    const own = locale ? value[locale] : undefined;
    if (typeof own === 'string' && own) return own;
    return Object.values(value).find((v): v is string => typeof v === 'string' && v !== '') ?? '';
}

/** What the code encodes, from the block's data. */
export function qrText(data: QrBlockData | undefined, locale?: string): string {
    const payload = data?.payload;
    return pick(typeof payload === 'string' ? payload : payload?.text, locale).trim();
}

const LINK = /^(https?:\/\/|mailto:|tel:)/i;

/** The code as an inline SVG: one path, each dark module a unit square. */
export function qrSvg(text: string, options: QrOptions = {}): string {
    const size = Math.max(32, Math.min(2048, Math.round(options.size ?? 256)));
    const margin = Math.max(0, Math.min(16, Math.round(options.margin ?? 2)));
    const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
    const n = modules.size;
    let d = '';
    for (let y = 0; y < n; y++) {
        // Runs of dark modules on a row become one rectangle: a shorter path.
        for (let x = 0; x < n; x++) {
            if (!modules.get(y, x)) continue;
            let run = 1;
            while (x + run < n && modules.get(y, x + run)) run++;
            d += `M${x + margin} ${y + margin}h${run}v1h-${run}z`;
            x += run - 1;
        }
    }
    const view = n + margin * 2;
    return (
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${view} ${view}" width="${size}" height="${size}" ` +
        `role="img" aria-label="${escapeHtml(`QR code: ${text}`)}" shape-rendering="crispEdges">` +
        `<rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`
    );
}

/** The block as HTML: the code, a link when it encodes one, and its caption. Empty without text. */
export function renderQr(
    data: QrBlockData | undefined,
    locale?: string,
    options?: QrOptions
): string {
    const text = qrText(data, locale);
    if (!text) return '';
    const svg = qrSvg(text, options);
    const caption = pick(data?.caption, locale).trim();
    const code = LINK.test(text) ? `<a href="${escapeHtml(text)}">${svg}</a>` : svg;
    return (
        `<figure class="moteur-qr">${code}` +
        (caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : '') +
        `</figure>`
    );
}

/** For a block registry: `createBlockRegistry({ load: () => import('@moteurio/frontend-plugin-qr') })`. */
export function render(block: QrBlock, locale: string): string {
    return renderQr(block?.data, locale);
}

/** `<moteur-qr text="…" caption="…" size="…" margin="…">`, defined once, in the browser only. */
export function registerMoteurQrElement(): void {
    if (typeof customElements === 'undefined' || customElements.get('moteur-qr')) return;

    class MoteurQr extends HTMLElement {
        static get observedAttributes() {
            return ['text', 'caption', 'size', 'margin'];
        }

        connectedCallback() {
            this.draw();
        }

        attributeChangedCallback() {
            if (this.isConnected) this.draw();
        }

        draw() {
            const size = Number(this.getAttribute('size'));
            const margin = Number(this.getAttribute('margin'));
            this.innerHTML = renderQr(
                {
                    payload: this.getAttribute('text') ?? '',
                    caption: this.getAttribute('caption') ?? ''
                },
                undefined,
                {
                    size: Number.isFinite(size) && size > 0 ? size : undefined,
                    margin:
                        Number.isFinite(margin) && this.hasAttribute('margin') ? margin : undefined
                }
            );
        }
    }

    customElements.define('moteur-qr', MoteurQr);
}
