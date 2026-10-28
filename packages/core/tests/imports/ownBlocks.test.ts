import { describe, it, expect } from 'vitest';
import type { ImportBundle } from '@moteurio/types/Import.js';
import { withOwnBlocks } from '../../src/imports/ownBlocks.js';

describe('a bundle’s own blocks', () => {
    it('become the project’s, in schemas and content', () => {
        const bundle = {
            version: 1,
            blocks: [
                { type: 'text', label: 'Text', fields: {} },
                { type: 'other-site/quote', label: 'Quote', fields: {} }
            ],
            templates: [
                {
                    id: 'page',
                    label: 'Page',
                    fields: {
                        body: {
                            type: 'core/block-list',
                            label: 'Body',
                            options: { allowedBlockTypes: ['text', 'core/image'] }
                        }
                    }
                }
            ],
            pages: [
                {
                    id: 'home',
                    label: 'Home',
                    slug: '',
                    templateId: 'page',
                    fields: {
                        body: [
                            { type: 'text', data: { body: 'Hi' } },
                            { type: 'core/image', data: {} }
                        ]
                    }
                }
            ]
        } as unknown as ImportBundle;
        const out = withOwnBlocks(bundle, 'my-site') as unknown as typeof bundle & {
            templates: { fields: { body: { options: { allowedBlockTypes: string[] } } } }[];
            pages: { fields: { body: { type: string }[] } }[];
        };
        expect(out.blocks!.map(b => b.type)).toEqual(['text', 'other-site/quote']);
        expect(out.templates[0]!.fields.body.options.allowedBlockTypes).toEqual([
            'my-site/text',
            'core/image'
        ]);
        expect(out.pages[0]!.fields.body.map(b => b.type)).toEqual(['my-site/text', 'core/image']);
    });

    it('leaves a bundle without short block types as it is', () => {
        const bundle = {
            version: 1,
            blocks: [{ type: 'my-site/text' }]
        } as unknown as ImportBundle;
        expect(withOwnBlocks(bundle, 'my-site')).toBe(bundle);
    });
});
