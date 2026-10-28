/**
 * Rich text (`core/rich-text`, stored as DAST) as HTML, without network calls:
 * `richTextHtml(entry.data.body)`. The same HTML Studio's editor shows.
 */

export type DastMark = 'strong' | 'emphasis' | 'underline' | 'strikethrough' | 'code' | 'highlight';

export type DastNode =
    | { type: 'paragraph'; children: DastNode[] }
    | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; children: DastNode[] }
    | { type: 'span'; value: string; marks?: DastMark[] }
    | { type: 'link'; url: string; children: DastNode[] }
    | { type: 'list'; style: 'bulleted' | 'numbered'; children: DastNode[] }
    | { type: 'listItem'; children: DastNode[] }
    | { type: 'blockquote'; children: DastNode[] }
    | { type: 'code'; code: string; language?: string }
    | { type: 'thematicBreak' };

export interface DastDocument {
    schema: 'dast';
    document: { type: 'root'; children: DastNode[] };
}

const MARK_TAG: Record<DastMark, string> = {
    strong: 'strong',
    emphasis: 'em',
    underline: 'u',
    strikethrough: 's',
    code: 'code',
    highlight: 'mark'
};

const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A link's address, unless it would run code (`javascript:`, `data:`…): then none. */
function safeUrl(url: string | undefined): string | undefined {
    const u = url?.trim();
    if (!u) return undefined;
    // Browsers ignore tabs, newlines and control characters in a scheme (`java\tscript:`).
    // eslint-disable-next-line no-control-regex
    const bare = u.replace(/[\u0000-\u0020\u007f]/g, '');
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(bare)?.[1]?.toLowerCase();
    return !scheme || ['http', 'https', 'mailto', 'tel'].includes(scheme) ? u : undefined;
}

function render(node: DastNode): string {
    const kids =
        'children' in node && Array.isArray(node.children)
            ? node.children.map(render).join('')
            : '';
    switch (node.type) {
        case 'paragraph':
            return `<p>${kids}</p>`;
        case 'heading': {
            const level = Math.min(6, Math.max(1, Number(node.level) || 2));
            return `<h${level}>${kids}</h${level}>`;
        }
        case 'span': {
            let out = escapeHtml(node.value ?? '').replace(/\n/g, '<br>');
            for (const m of node.marks ?? [])
                if (MARK_TAG[m]) out = `<${MARK_TAG[m]}>${out}</${MARK_TAG[m]}>`;
            return out;
        }
        case 'link': {
            const href = safeUrl(node.url);
            return href ? `<a href="${escapeHtml(href)}">${kids}</a>` : kids;
        }
        case 'list':
            return node.style === 'numbered' ? `<ol>${kids}</ol>` : `<ul>${kids}</ul>`;
        case 'listItem':
            return `<li>${kids}</li>`;
        case 'blockquote':
            return `<blockquote>${kids}</blockquote>`;
        case 'code':
            return `<pre><code${node.language ? ` class="language-${escapeHtml(node.language)}"` : ''}>${escapeHtml(node.code ?? '')}</code></pre>`;
        case 'thematicBreak':
            return '<hr>';
        default:
            return '';
    }
}

/**
 * A rich-text value as HTML: the field's value as delivered (`{ dast }`, in one language), or
 * the DAST document itself. Text is escaped, and links that would run code are dropped. Empty
 * for anything else (a value still in every language, read without `locale`).
 */
export function richTextHtml(value: unknown): string {
    const doc = (value as { dast?: unknown } | null)?.dast ?? value;
    const children = (doc as DastDocument | null)?.document?.children;
    return Array.isArray(children) ? children.map(render).join('') : '';
}
