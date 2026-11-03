import { describe, expect, it } from 'vitest';
import { adaptBundleToLanguages } from '../../src/imports/bundleLanguages.js';

const bundle = {
    version: 1 as const,
    templates: [{ id: 'page', label: { en: 'Page', fr: 'Page' }, fields: {} }],
    pages: [
        {
            id: 'about',
            label: 'About',
            slug: 'about',
            slugs: { fr: 'a-propos' },
            templateId: 'page',
            fields: {
                title: { en: 'About', fr: 'À propos' },
                body: { dast: { en: 'doc-en', fr: 'doc-fr' } },
                year: 2026
            }
        },
        {
            id: 'guide',
            label: 'Guide',
            slug: 'guide',
            templateId: 'page',
            languages: ['en'],
            fields: {}
        }
    ],
    entries: {
        post: [
            {
                id: 'a',
                data: { title: { en: 'Hello', fr: 'Bonjour' }, tags: ['x'] },
                languages: ['en', 'fr']
            }
        ]
    },
    menus: [{ handle: 'main', items: [{ id: 'about', label: { en: 'About', fr: 'À propos' } }] }]
};
const from = ['en', 'fr'];

describe('a bundle made to fit a project’s languages', () => {
    it('keeps an English-only project’s languages only', () => {
        const out = adaptBundleToLanguages(bundle as never, from, {
            defaultLocale: 'en',
            locales: []
        });
        expect(out.pages![0]).toMatchObject({
            slug: 'about',
            fields: { title: { en: 'About' }, body: { dast: { en: 'doc-en' } }, year: 2026 }
        });
        expect(out.pages![0]).not.toHaveProperty('slugs');
        expect(out.entries!.post![0]).toEqual({
            id: 'a',
            data: { title: { en: 'Hello' }, tags: ['x'] },
            languages: ['en']
        });
        expect(out.menus![0]!.items).toEqual([{ id: 'about', label: { en: 'About' } }]);
        expect(out.templates).toEqual(bundle.templates);
    });

    it('puts French first in a French project, English as the other language', () => {
        const out = adaptBundleToLanguages(bundle as never, from, {
            defaultLocale: 'fr',
            locales: ['en']
        });
        expect(out.pages![0]).toMatchObject({ slug: 'a-propos', slugs: { en: 'about' } });
        expect(out.pages![1]).toMatchObject({ languages: ['fr'] });
    });

    it('gives a language the bundle doesn’t have its main language’s text, to translate', () => {
        const out = adaptBundleToLanguages(bundle as never, from, {
            defaultLocale: 'de',
            locales: ['de', 'fr']
        });
        expect(out.pages![0]).toMatchObject({
            slug: 'about',
            slugs: { fr: 'a-propos' },
            fields: { title: { de: 'About', fr: 'À propos' } }
        });
    });
});
