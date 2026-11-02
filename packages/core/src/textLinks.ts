/**
 * Links to pages written inside text, so they follow the page (its address in each language, a
 * move) as a `core/link` does:
 * - rich text (DAST): a `link` node naming its page in `meta`:
 *   `{ "type": "link", "url": "/pricing", "meta": [{ "id": "pageId", "value": "pricing" }] }`;
 * - Markdown: `[See prices](page:pricing)`.
 * On delivery each gets the page's address; a page that is gone or not live loses the link and
 * keeps its words.
 */
import { isPlainObject } from './validators/fieldValueUtils.js';

export type TextKind = 'dast' | 'markdown';

/** `[words](page:id)` or `[words](page:id "title")`; not a picture (`![…]`). */
const MARKDOWN_PAGE_LINK = /(?<!!)\[((?:\\.|[^\]\\])*)\]\(\s*page:([^\s)]+)(\s+"[^"]*")?\s*\)/g;

/** The page a DAST link names in its meta, if any. */
export function dastLinkPage(node: unknown): string | null {
    if (!isPlainObject(node) || (node as { type?: unknown }).type !== 'link') return null;
    const meta = (node as { meta?: unknown }).meta;
    if (!Array.isArray(meta)) return null;
    const entry = meta.find(m => isPlainObject(m) && (m as { id?: unknown }).id === 'pageId') as
        { value?: unknown } | undefined;
    return typeof entry?.value === 'string' && entry.value.trim() ? entry.value : null;
}

/** Every page a rich-text or Markdown value links to, in every language it holds. */
export function pagesLinkedIn(value: unknown, kind: TextKind): string[] {
    const found = new Set<string>();
    const walk = (v: unknown): void => {
        if (typeof v === 'string') {
            if (kind === 'markdown')
                for (const m of v.matchAll(MARKDOWN_PAGE_LINK)) found.add(m[2]!);
            return;
        }
        if (Array.isArray(v)) return v.forEach(walk);
        if (!isPlainObject(v)) return;
        if (kind === 'dast') {
            const page = dastLinkPage(v);
            if (page) found.add(page);
        }
        Object.values(v as Record<string, unknown>).forEach(walk);
    };
    walk(value);
    return [...found];
}

/**
 * The page's address for a link, in a language, or null when the reader may not follow it (gone,
 * a folder, not live).
 */
export type AddressOf = (pageId: string, locale: string) => string | null;

/**
 * A rich-text or Markdown value with its page links given their addresses. A value per language
 * (`{ en, fr }`, at any depth) gives each its own language's address; otherwise `locale`.
 */
export function fillTextLinks(
    value: unknown,
    kind: TextKind,
    addressOf: AddressOf,
    options: { locale: string; locales: string[] }
): unknown {
    const isLocale = (key: string) => options.locales.includes(key);

    const markdown = (text: string, locale: string) =>
        text.replace(MARKDOWN_PAGE_LINK, (_all, words: string, id: string, title = '') => {
            const url = addressOf(id, locale);
            return url ? `[${words}](${url}${title})` : words;
        });

    /** A node, or the nodes standing in for it (an unwrapped link's children). */
    const walk = (v: unknown, locale: string): unknown => {
        if (typeof v === 'string') return kind === 'markdown' ? markdown(v, locale) : v;
        if (Array.isArray(v)) {
            const out: unknown[] = [];
            for (const item of v) {
                const page = kind === 'dast' ? dastLinkPage(item) : null;
                if (page && !addressOf(page, locale)) {
                    // Not followable: the words stay, the link goes.
                    const children = (item as { children?: unknown }).children;
                    if (Array.isArray(children)) out.push(...children.map(c => walk(c, locale)));
                    continue;
                }
                out.push(walk(item, locale));
            }
            return out;
        }
        if (!isPlainObject(v)) return v;
        const obj = v as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const [key, sub] of Object.entries(obj))
            out[key] = walk(sub, isLocale(key) ? key : locale);
        const page = kind === 'dast' ? dastLinkPage(obj) : null;
        if (page) out.url = addressOf(page, locale) ?? obj.url;
        return out;
    };
    return walk(value, options.locale);
}
