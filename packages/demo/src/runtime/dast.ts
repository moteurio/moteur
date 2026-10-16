/**
 * A small markup for writing rich text in the demo sources, converted to DAST (the stored
 * format of core/rich-text):
 *
 *   ## Heading            (# to ######)
 *   - item / 1. item      bulleted / numbered list
 *   > quote               blockquote
 *   ```lang ... ```       code block
 *   ---                   thematic break
 *   **strong** *em* __underline__ ~~strike~~ `code` [label](url)
 *
 * Blank lines separate blocks. Anything else is a paragraph.
 */

export type DastMark = 'strong' | 'emphasis' | 'underline' | 'strikethrough' | 'code';
export type DastInline =
    | { type: 'span'; value: string; marks?: DastMark[] }
    | { type: 'link'; url: string; children: DastInline[] };
export type DastBlock =
    | { type: 'paragraph'; children: DastInline[] }
    | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; children: DastInline[] }
    | { type: 'list'; style: 'bulleted' | 'numbered'; children: DastListItem[] }
    | { type: 'blockquote'; children: DastBlock[] }
    | { type: 'code'; code: string; language?: string }
    | { type: 'thematicBreak' };
export type DastListItem = { type: 'listItem'; children: DastBlock[] };
export type DastDocument = { schema: 'dast'; document: { type: 'root'; children: DastBlock[] } };

const INLINE =
    /(\*\*([^*]+)\*\*)|(__([^_]+)__)|(~~([^~]+)~~)|(`([^`]+)`)|(\*([^*]+)\*)|(\[([^\]]+)\]\(([^)\s]+)\))/;

export function inline(text: string, marks: DastMark[] = []): DastInline[] {
    const out: DastInline[] = [];
    let rest = text;
    while (rest.length > 0) {
        const m = INLINE.exec(rest);
        if (!m) {
            out.push(span(rest, marks));
            break;
        }
        if (m.index > 0) out.push(span(rest.slice(0, m.index), marks));
        if (m[2] !== undefined) out.push(...inline(m[2], [...marks, 'strong']));
        else if (m[4] !== undefined) out.push(...inline(m[4], [...marks, 'underline']));
        else if (m[6] !== undefined) out.push(...inline(m[6], [...marks, 'strikethrough']));
        else if (m[8] !== undefined) out.push(span(m[8], [...marks, 'code']));
        else if (m[10] !== undefined) out.push(...inline(m[10], [...marks, 'emphasis']));
        else if (m[12] !== undefined) {
            out.push({ type: 'link', url: m[13], children: inline(m[12], marks) });
        }
        rest = rest.slice(m.index + m[0].length);
    }
    return out;
}

function span(value: string, marks: DastMark[]): DastInline {
    return marks.length > 0 ? { type: 'span', value, marks: [...marks] } : { type: 'span', value };
}

function blocks(source: string): DastBlock[] {
    const lines = source.replace(/\r\n/g, '\n').split('\n');
    const out: DastBlock[] = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        if (line.trim() === '') {
            i++;
            continue;
        }
        const fence = /^```(\w*)\s*$/.exec(line);
        if (fence) {
            const code: string[] = [];
            i++;
            while (i < lines.length && !/^```\s*$/.test(lines[i])) code.push(lines[i++]);
            i++;
            out.push({
                type: 'code',
                code: code.join('\n'),
                ...(fence[1] ? { language: fence[1] } : {})
            });
            continue;
        }
        if (/^---\s*$/.test(line)) {
            out.push({ type: 'thematicBreak' });
            i++;
            continue;
        }
        const heading = /^(#{1,6})\s+(.*)$/.exec(line);
        if (heading) {
            out.push({
                type: 'heading',
                level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6,
                children: inline(heading[2])
            });
            i++;
            continue;
        }
        if (/^>\s?/.test(line)) {
            const quoted: string[] = [];
            while (i < lines.length && /^>\s?/.test(lines[i])) {
                quoted.push(lines[i++].replace(/^>\s?/, ''));
            }
            out.push({ type: 'blockquote', children: blocks(quoted.join('\n')) });
            continue;
        }
        const bullet = /^\s*([-*]|\d+\.)\s+/;
        if (bullet.test(line)) {
            const numbered = /^\s*\d+\./.test(line);
            const items: DastListItem[] = [];
            while (i < lines.length && bullet.test(lines[i])) {
                items.push({
                    type: 'listItem',
                    children: [
                        { type: 'paragraph', children: inline(lines[i++].replace(bullet, '')) }
                    ]
                });
            }
            out.push({ type: 'list', style: numbered ? 'numbered' : 'bulleted', children: items });
            continue;
        }
        const para: string[] = [];
        while (
            i < lines.length &&
            lines[i].trim() !== '' &&
            !/^(#{1,6}\s|>|```|---\s*$)/.test(lines[i]) &&
            !bullet.test(lines[i])
        ) {
            para.push(lines[i++].trim());
        }
        out.push({ type: 'paragraph', children: inline(para.join(' ')) });
    }
    return out;
}

/** One DAST document from markup. */
export function dast(source: string): DastDocument {
    return { schema: 'dast', document: { type: 'root', children: blocks(source) } };
}

/** A multilingual rich-text value: `{ dast: { fr: …, en: … } }`. Locales left out stay missing. */
export function richText(byLocale: Record<string, string | undefined>): {
    dast: Record<string, DastDocument>;
} {
    const out: Record<string, DastDocument> = {};
    for (const [locale, source] of Object.entries(byLocale)) {
        if (source !== undefined) out[locale] = dast(source);
    }
    return { dast: out };
}
