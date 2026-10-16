import { describe, expect, it } from 'vitest';
import { dast, inline, richText } from '../src/runtime/dast.js';

describe('dast markup', () => {
    it('converts marks and links', () => {
        expect(inline('a **b** *c* __d__ ~~e~~ `f` [g](https://x.test)')).toEqual([
            { type: 'span', value: 'a ' },
            { type: 'span', value: 'b', marks: ['strong'] },
            { type: 'span', value: ' ' },
            { type: 'span', value: 'c', marks: ['emphasis'] },
            { type: 'span', value: ' ' },
            { type: 'span', value: 'd', marks: ['underline'] },
            { type: 'span', value: ' ' },
            { type: 'span', value: 'e', marks: ['strikethrough'] },
            { type: 'span', value: ' ' },
            { type: 'span', value: 'f', marks: ['code'] },
            { type: 'span', value: ' ' },
            { type: 'link', url: 'https://x.test', children: [{ type: 'span', value: 'g' }] }
        ]);
    });

    it('converts blocks', () => {
        const doc = dast(
            '## Title\n\nOne\ntwo.\n\n- a\n- b\n\n1. x\n\n> quoted\n\n```js\ncode()\n```\n\n---'
        );
        expect(doc.schema).toBe('dast');
        expect(doc.document.children.map(b => b.type)).toEqual([
            'heading',
            'paragraph',
            'list',
            'list',
            'blockquote',
            'code',
            'thematicBreak'
        ]);
        expect(doc.document.children[1]).toEqual({
            type: 'paragraph',
            children: [{ type: 'span', value: 'One two.' }]
        });
        expect(doc.document.children[3]).toMatchObject({ style: 'numbered' });
        expect(doc.document.children[5]).toEqual({ type: 'code', code: 'code()', language: 'js' });
    });

    it('builds multilingual values and leaves missing locales out', () => {
        expect(Object.keys(richText({ fr: 'Bonjour', en: undefined }).dast)).toEqual(['fr']);
    });
});
