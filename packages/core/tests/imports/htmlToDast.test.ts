import { describe, expect, it } from 'vitest';
import { htmlToDast, leftOutText } from '../../src/imports/htmlToDast.js';
import { validateDastField } from '../../src/validators/fields/core/validateDastField.js';

const children = (html: string, pageAt?: (h: string) => string | null) =>
    htmlToDast(html, pageAt).doc.document.children;

describe('HTML to rich text', () => {
    it('keeps paragraphs, headings, marks and line breaks', () => {
        expect(
            children(
                '<h2>Hello</h2><p>Some <strong>bold</strong> and <em>soft</em> words.<br>Next</p>'
            )
        ).toEqual([
            { type: 'heading', level: 2, children: [{ type: 'span', value: 'Hello' }] },
            {
                type: 'paragraph',
                children: [
                    { type: 'span', value: 'Some ' },
                    { type: 'span', value: 'bold', marks: ['strong'] },
                    { type: 'span', value: ' and ' },
                    { type: 'span', value: 'soft', marks: ['emphasis'] },
                    { type: 'span', value: ' words.\nNext' }
                ]
            }
        ]);
    });

    it('keeps lists, quotes, code and rules; loose text becomes a paragraph', () => {
        const out = children(
            'Intro &amp; more<ul><li>One</li><li><p>Two</p><ol><li>Two.a</li></ol></li></ul><blockquote>Said</blockquote><pre><code class="language-js">a &lt; b\n</code></pre><hr>'
        );
        expect(out.map(b => b.type)).toEqual([
            'paragraph',
            'list',
            'blockquote',
            'code',
            'thematicBreak'
        ]);
        expect(out[0]).toEqual({
            type: 'paragraph',
            children: [{ type: 'span', value: 'Intro & more' }]
        });
        expect(out[3]).toEqual({ type: 'code', code: 'a < b', language: 'js' });
        const list = out[1] as any;
        expect(list.children[1].children.map((c: any) => c.type)).toEqual(['paragraph', 'list']);
    });

    it('makes a link to a page of an address that is one', () => {
        const pageAt = (href: string) => (href === '/download' ? 'download' : null);
        const result = htmlToDast(
            '<p><a href="/download">Get it</a> or <a href="https://x.test">elsewhere</a></p>',
            pageAt
        );
        const [p] = result.doc.document.children as any[];
        expect(p.children[0]).toEqual({
            type: 'link',
            url: '/download',
            meta: [{ id: 'pageId', value: 'download' }],
            children: [{ type: 'span', value: 'Get it' }]
        });
        expect(p.children[2]).toEqual({
            type: 'link',
            url: 'https://x.test',
            children: [{ type: 'span', value: 'elsewhere' }]
        });
        expect(result.pageLinks).toBe(1);
    });

    it('says what it left out, and keeps a figure’s caption', () => {
        const result = htmlToDast(
            '<p>Look <img src="a.png"></p><figure><img src="b.png"><figcaption>The inbox</figcaption></figure><table><tr><td>x</td></tr></table><script>alert(1)</script>'
        );
        expect(result.leftOut).toEqual({ pictures: 2, tables: 1 });
        expect(leftOutText(result.leftOut)).toBe('2 pictures and 1 table');
        expect(result.doc.document.children).toEqual([
            { type: 'paragraph', children: [{ type: 'span', value: 'Look' }] },
            { type: 'paragraph', children: [{ type: 'span', value: 'The inbox' }] }
        ]);
    });

    it('gives a document rich-text fields accept', () => {
        const { doc } = htmlToDast('<p>Hi</p>');
        expect(
            validateDastField(doc, { type: 'core/rich-text', label: 'x' } as never, 'x')
        ).toEqual([]);
    });
});
