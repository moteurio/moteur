import { describe, expect, it } from 'vitest';
import type { Field } from '@moteurio/types/Field.js';
import type { BlockSchema } from '@moteurio/types/Block.js';
import { prepareFields } from '../src/runtime/prepare.js';
import { f } from '../src/runtime/fields.js';

const art = (key: string) => ({
    assetId: `id-${key}`,
    url: `https://cdn.test/${key}.webp`,
    alt: { fr: `alt ${key}` }
});
const blocks: Record<string, BlockSchema> = {
    'core/paragraph': {
        type: 'core/paragraph',
        label: 'P',
        fields: { content: f.richText('Content', { multilingual: true }) }
    } as BlockSchema
};

describe('prepareFields', () => {
    const fields: Record<string, Field> = {
        body: f.richText('Body', { multilingual: true }),
        cover: f.asset('Cover'),
        hero: f.image('Hero'),
        gallery: f.assetList('Gallery'),
        blocks: f.blocks('Blocks'),
        specs: f.list('Specs', f.object('Spec', { note: f.richText('Note') })),
        title: f.text('Title')
    };

    it('converts markup, art references, blocks and nested lists', () => {
        const out = prepareFields(
            fields,
            {
                body: { fr: '**Gras**', en: 'Bold' },
                cover: { art: 'a' },
                hero: { art: 'b', caption: 'Légende' },
                gallery: [{ art: 'a' }, { assetId: 'kept' }],
                blocks: [
                    { type: 'core/paragraph', data: { content: { fr: 'Texte' } } },
                    { type: 'unknown/x', data: { y: 1 } }
                ],
                specs: [{ note: 'Une *note*' }],
                title: 'Unchanged',
                extra: 'not in schema'
            },
            { blocks, art }
        );
        expect((out.body as { dast: Record<string, unknown> }).dast.fr).toMatchObject({
            schema: 'dast'
        });
        expect(out.cover).toEqual({ assetId: 'id-a', alt: { fr: 'alt a' } });
        expect(out.hero).toEqual({
            src: 'https://cdn.test/b.webp',
            alt: { fr: 'alt b' },
            caption: 'Légende'
        });
        expect(out.gallery).toEqual([
            { assetId: 'id-a', alt: { fr: 'alt a' } },
            { assetId: 'kept' }
        ]);
        expect(
            (out.blocks as Array<{ data: { content: { dast: unknown } } }>)[0].data.content.dast
        ).toBeDefined();
        expect((out.blocks as unknown[])[1]).toEqual({ type: 'unknown/x', data: { y: 1 } });
        expect((out.specs as Array<{ note: unknown }>)[0].note).toMatchObject({ schema: 'dast' });
        expect(out.title).toBe('Unchanged');
        expect(out.extra).toBe('not in schema');
    });

    it('leaves values already in stored form alone', () => {
        const stored = {
            dast: { fr: { schema: 'dast', document: { type: 'root', children: [] } } }
        };
        expect(prepareFields(fields, { body: stored }, { blocks, art }).body).toBe(stored);
    });
});
