/**
 * Converts HTML to a rich-text (DAST) document for imports. A bundle may give a rich-text field as
 * `{ "html": "<p>…</p>" }`. The conversion keeps what DAST can represent (paragraphs, headings,
 * lists, quotes, code, rules, line breaks; bold, italic, underline, strikethrough, code and
 * highlighted text; links) and reports what it dropped (images, tables, embeds, forms). A link to
 * the address of a page becomes a link to that page (see textLinks.ts), so it keeps working if the
 * page's address changes.
 */
import { parseDocument } from 'htmlparser2';

type Mark = 'strong' | 'emphasis' | 'underline' | 'strikethrough' | 'code' | 'highlight';
type Span = { type: 'span'; value: string; marks?: Mark[] };
type Link = {
    type: 'link';
    url: string;
    meta?: { id: string; value: string }[];
    children: Span[];
};
type Inline = Span | Link;
type Block =
    | { type: 'paragraph'; children: Inline[] }
    | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; children: Inline[] }
    | { type: 'list'; style: 'bulleted' | 'numbered'; children: ListItem[] }
    | { type: 'blockquote'; children: { type: 'paragraph'; children: Inline[] }[] }
    | { type: 'code'; code: string; language?: string }
    | { type: 'thematicBreak' };
type ListItem = { type: 'listItem'; children: Block[] };

export type DastDocument = { schema: 'dast'; document: { type: 'root'; children: Block[] } };

/** What a conversion did besides producing text: the content it dropped and the page links it created. */
export type HtmlConversion = {
    doc: DastDocument;
    /** Count of dropped content by kind, such as `{ pictures: 2, tables: 1 }`. */
    leftOut: Record<string, number>;
    pageLinks: number;
};

/** A parsed node, as htmlparser2 gives it. */
type Node = {
    type: string;
    name?: string;
    data?: string;
    attribs?: Record<string, string>;
    children?: Node[];
};

const MARKS: Record<string, Mark> = {
    strong: 'strong',
    b: 'strong',
    em: 'emphasis',
    i: 'emphasis',
    u: 'underline',
    s: 'strikethrough',
    del: 'strikethrough',
    strike: 'strikethrough',
    code: 'code',
    kbd: 'code',
    mark: 'highlight'
};

/** Elements DAST cannot represent, mapped to the kind named in the report. */
const LEFT_OUT: Record<string, string> = {
    img: 'pictures',
    picture: 'pictures',
    svg: 'pictures',
    figure: '',
    table: 'tables',
    iframe: 'embeds',
    video: 'embeds',
    audio: 'embeds',
    object: 'embeds',
    embed: 'embeds',
    canvas: 'embeds',
    form: 'forms'
};
/** Elements that never contain content. */
const IGNORED = new Set([
    'script',
    'style',
    'template',
    'noscript',
    'head',
    'title',
    'meta',
    'link'
]);
const BLOCKS = new Set([
    'p',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'ul',
    'ol',
    'li',
    'blockquote',
    'pre',
    'hr',
    'div',
    'section',
    'article',
    'main',
    'header',
    'footer',
    'aside',
    'nav',
    'figure',
    'figcaption',
    'details',
    'summary',
    'dl',
    'dt',
    'dd',
    'address',
    'body',
    'html'
]);

const textOf = (node: Node): string =>
    node.type === 'text' ? (node.data ?? '') : (node.children ?? []).map(textOf).join('');

/**
 * @param pageAt Maps an address (`/pricing`) to the id of the page it leads to, or returns null.
 * A link to an address that maps to a page becomes a link to that page.
 */
export function htmlToDast(
    html: string,
    pageAt: (href: string) => string | null = () => null
): HtmlConversion {
    const leftOut: Record<string, number> = {};
    let pageLinks = 0;
    const skip = (name: string) => {
        const kind = LEFT_OUT[name];
        if (kind) leftOut[kind] = (leftOut[kind] ?? 0) + 1;
    };
    const root = parseDocument(html, { decodeEntities: true }) as unknown as Node;

    /** Converts inline content to spans with marks and links, merging adjacent spans that have the same marks. */
    function inline(nodes: Node[], marks: Mark[], out: Inline[], inLink = false): Inline[] {
        const push = (value: string) => {
            if (!value) return;
            const last = out[out.length - 1];
            if (last?.type === 'span' && (last.marks ?? []).join() === marks.join())
                last.value += value;
            else
                out.push(
                    marks.length
                        ? { type: 'span', value, marks: [...marks] }
                        : { type: 'span', value }
                );
        };
        for (const node of nodes) {
            if (node.type === 'text') {
                push((node.data ?? '').replace(/\s+/g, ' '));
                continue;
            }
            if (node.type !== 'tag') continue;
            const name = node.name ?? '';
            if (IGNORED.has(name)) continue;
            if (name in LEFT_OUT && LEFT_OUT[name]) {
                skip(name);
                continue;
            }
            if (name === 'br') push('\n');
            else if (name === 'a' && !inLink && node.attribs?.href) {
                const href = node.attribs.href.trim();
                const page = pageAt(href);
                if (page) pageLinks++;
                const children = inline(node.children ?? [], marks, [], true) as Span[];
                if (children.length)
                    out.push({
                        type: 'link',
                        url: href,
                        ...(page && { meta: [{ id: 'pageId', value: page }] }),
                        children
                    });
            } else if (MARKS[name]) {
                const mark = MARKS[name]!;
                inline(
                    node.children ?? [],
                    marks.includes(mark) ? marks : [...marks, mark],
                    out,
                    inLink
                );
            } else inline(node.children ?? [], marks, out, inLink);
        }
        return out;
    }

    /** Trims a run of inline content. If nothing is left, no paragraph is created. */
    function trimmed(nodes: Inline[]): Inline[] {
        const first = nodes[0];
        if (first?.type === 'span') first.value = first.value.replace(/^\s+/, '');
        const last = nodes[nodes.length - 1];
        if (last?.type === 'span') last.value = last.value.replace(/\s+$/, '');
        return nodes.filter(n => n.type !== 'span' || n.value !== '');
    }

    /** Converts block content. Inline content that is not inside a block is gathered into paragraphs. */
    function blocks(nodes: Node[]): Block[] {
        const out: Block[] = [];
        let loose: Node[] = [];
        const flush = () => {
            const children = trimmed(inline(loose, [], []));
            if (children.length) out.push({ type: 'paragraph', children });
            loose = [];
        };
        for (const node of nodes) {
            const name = node.type === 'tag' ? (node.name ?? '') : '';
            if (node.type !== 'tag' || !BLOCKS.has(name)) {
                if (node.type === 'tag' && LEFT_OUT[name]) {
                    flush();
                    skip(name);
                } else if (node.type === 'text' || node.type === 'tag') loose.push(node);
                continue;
            }
            flush();
            const children = node.children ?? [];
            if (
                name === 'p' ||
                name === 'dt' ||
                name === 'dd' ||
                name === 'summary' ||
                name === 'figcaption' ||
                name === 'address'
            ) {
                const kids = trimmed(inline(children, [], []));
                if (kids.length) out.push({ type: 'paragraph', children: kids });
            } else if (/^h[1-6]$/.test(name)) {
                const kids = trimmed(inline(children, [], []));
                if (kids.length)
                    out.push({ type: 'heading', level: Number(name[1]) as 1, children: kids });
            } else if (name === 'ul' || name === 'ol') {
                const items: ListItem[] = [];
                for (const li of children) {
                    if (li.type !== 'tag') continue;
                    const inner = li.name === 'li' ? blocks(li.children ?? []) : blocks([li]);
                    // A list item can only contain paragraphs and nested lists.
                    const kept = inner.flatMap(b =>
                        b.type === 'paragraph' || b.type === 'list'
                            ? [b]
                            : b.type === 'heading'
                              ? [{ type: 'paragraph' as const, children: b.children }]
                              : []
                    );
                    if (kept.length) items.push({ type: 'listItem', children: kept });
                }
                if (items.length)
                    out.push({
                        type: 'list',
                        style: name === 'ol' ? 'numbered' : 'bulleted',
                        children: items
                    });
            } else if (name === 'blockquote') {
                const paragraphs = blocks(children).flatMap(b =>
                    b.type === 'paragraph'
                        ? [b]
                        : b.type === 'heading'
                          ? [{ type: 'paragraph' as const, children: b.children }]
                          : []
                );
                if (paragraphs.length) out.push({ type: 'blockquote', children: paragraphs });
            } else if (name === 'pre') {
                const code = children.find(c => c.type === 'tag' && c.name === 'code');
                const language = /(?:^|\s)(?:language|lang)-([\w+#-]+)/.exec(
                    code?.attribs?.class ?? ''
                )?.[1];
                const text = textOf(code ?? node).replace(/\n$/, '');
                if (text) out.push({ type: 'code', code: text, ...(language && { language }) });
            } else if (name === 'hr') out.push({ type: 'thematicBreak' });
            else out.push(...blocks(children));
        }
        flush();
        return out;
    }

    return {
        doc: { schema: 'dast', document: { type: 'root', children: blocks(root.children ?? []) } },
        leftOut,
        pageLinks
    };
}

/** Describes dropped content in one phrase, such as "2 pictures and 1 table". */
export function leftOutText(leftOut: Record<string, number>): string {
    const one: Record<string, string> = {
        pictures: 'picture',
        tables: 'table',
        embeds: 'embed',
        forms: 'form'
    };
    const parts = Object.entries(leftOut).map(
        ([kind, n]) => `${n} ${n === 1 ? (one[kind] ?? kind) : kind}`
    );
    return parts.length > 1
        ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
        : (parts[0] ?? '');
}
