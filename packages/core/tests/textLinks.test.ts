import { describe, expect, it } from 'vitest';
import { fillTextLinks, pagesLinkedIn } from '../src/textLinks.js';

const addresses: Record<string, Record<string, string>> = {
    pricing: { en: '/pricing', fr: '/fr/tarifs' }
};
// A page the reader may follow: its address in the language, or the default's.
const addressOf = (id: string, locale: string) =>
    addresses[id] ? (addresses[id]![locale] ?? addresses[id]!.en!) : null;
const options = { locale: 'en', locales: ['en', 'fr'] };

const link = (page: string, words: string) => ({
    type: 'link',
    url: '/old',
    meta: [{ id: 'pageId', value: page }],
    children: [{ type: 'span', value: words }]
});
const doc = (...children: unknown[]) => ({
    schema: 'dast',
    document: { type: 'root', children: [{ type: 'paragraph', children }] }
});

describe('links to pages in text', () => {
    it('finds them in rich text and Markdown, in every language', () => {
        expect(
            pagesLinkedIn(
                { dast: { en: doc(link('pricing', 'Prices')), fr: doc(link('home', 'Accueil')) } },
                'dast'
            )
        ).toEqual(['pricing', 'home']);
        expect(
            pagesLinkedIn({ en: 'See [prices](page:pricing) and ![a](page:x)' }, 'markdown')
        ).toEqual(['pricing']);
    });

    it('gives a rich-text link its page’s address in each language, and unwraps one it can’t follow', () => {
        const out = fillTextLinks(
            {
                dast: {
                    en: doc(link('pricing', 'Prices')),
                    fr: doc(link('pricing', 'Tarifs'), link('gone', 'Ailleurs'))
                }
            },
            'dast',
            addressOf,
            options
        ) as any;
        expect(out.dast.en.document.children[0].children[0].url).toBe('/pricing');
        const fr = out.dast.fr.document.children[0].children;
        expect(fr[0].url).toBe('/fr/tarifs');
        expect(fr[1]).toEqual({ type: 'span', value: 'Ailleurs' });
    });

    it('gives a Markdown link its address, keeps a title, and leaves only the words of one it can’t follow', () => {
        const out = fillTextLinks(
            {
                en: 'See [prices](page:pricing "Plans").',
                fr: 'Voir [les tarifs](page:pricing) ou [ça](page:gone).'
            },
            'markdown',
            addressOf,
            options
        );
        expect(out).toEqual({
            en: 'See [prices](/pricing "Plans").',
            fr: 'Voir [les tarifs](/fr/tarifs) ou ça.'
        });
    });

    it('uses the language read when the value is in one language', () => {
        expect(
            fillTextLinks('[x](page:pricing)', 'markdown', addressOf, { ...options, locale: 'fr' })
        ).toBe('[x](/fr/tarifs)');
    });
});
