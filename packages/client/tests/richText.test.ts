import { describe, it, expect } from 'vitest';
import { richTextHtml } from '../src/richText.js';

const doc = (...children: unknown[]) => ({ schema: 'dast', document: { type: 'root', children } });
const span = (value: string, marks?: string[]) => ({
    type: 'span',
    value,
    ...(marks && { marks })
});

describe('richTextHtml', () => {
    it('writes what the editor writes', () => {
        const html = richTextHtml({
            dast: doc(
                { type: 'heading', level: 2, children: [span('Le quai')] },
                { type: 'paragraph', children: [span('Bonjour '), span('Louise', ['strong'])] },
                {
                    type: 'list',
                    style: 'numbered',
                    children: [{ type: 'listItem', children: [span('un')] }]
                },
                { type: 'code', code: '<b>', language: 'html' },
                { type: 'thematicBreak' }
            )
        });
        expect(html).toBe(
            '<h2>Le quai</h2><p>Bonjour <strong>Louise</strong></p><ol><li>un</li></ol>' +
                '<pre><code class="language-html">&lt;b&gt;</code></pre><hr>'
        );
    });

    it('escapes text and keeps links that cannot run code', () => {
        const html = richTextHtml(
            doc({
                type: 'paragraph',
                children: [
                    { type: 'link', url: 'https://moteur.io', children: [span('ok')] },
                    { type: 'link', url: 'javascript:alert(1)', children: [span('<no>')] },
                    { type: 'link', url: ' java\tscript:alert(1)', children: [span('!')] }
                ]
            })
        );
        expect(html).toBe('<p><a href="https://moteur.io">ok</a>&lt;no&gt;!</p>');
    });

    it('gives nothing for what is not rich text in one language', () => {
        expect(richTextHtml(undefined)).toBe('');
        expect(richTextHtml({ dast: { fr: doc(), en: doc() } })).toBe('');
    });
});
