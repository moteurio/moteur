import { describe, it, expect } from 'vitest';
import '../../src/fields/index.js';
import { resolvePageLinks, type PageLinkContext } from '../../src/pageLinks.js';
import { buildNodeMap, resolveNodePrefix } from '../../src/pages/urlResolver.js';
import type { Field } from '@moteurio/types/Field.js';
import type { PageNode, StaticPage } from '@moteurio/types/Page.js';

function page(id: string, slug: string, extra: Partial<StaticPage> = {}): StaticPage {
    return {
        id,
        projectId: 'site',
        type: 'static',
        label: extra.label ?? id,
        slug,
        parentId: null,
        order: 0,
        navInclude: true,
        sitemapInclude: true,
        templateId: 'page',
        status: 'published',
        fields: {},
        createdAt: '',
        updatedAt: '',
        ...extra
    };
}

const nodes: PageNode[] = [
    page('pricing', 'pricing', {
        label: 'Pricing',
        slugs: { fr: 'tarifs' },
        fields: { seo: { title: { en: 'Pricing' } }, blocks: [] }
    }),
    page('forms', 'forms', { label: 'Forms', fields: { seo: { title: { en: 'Forms' } } } }),
    page('draft', 'soon', { status: 'draft' }),
    { ...page('docs', 'docs'), type: 'folder' } as PageNode
];

function context(): PageLinkContext {
    const pages = buildNodeMap(nodes);
    return {
        pages,
        defaultLocale: 'en',
        urls: id =>
            Object.fromEntries(
                ['en', 'fr'].map(locale => [
                    locale,
                    resolveNodePrefix(id, pages, { locale, defaultLocale: 'en', prefix: 'others' })
                ])
            ),
        schemas: {
            blocks: {
                'site/cta': {
                    type: 'site/cta',
                    label: 'CTA',
                    fields: {
                        primary: {
                            type: 'core/structure',
                            label: 'Primary',
                            options: { structure: 'site/cta' }
                        }
                    }
                } as any,
                'site/related': {
                    type: 'site/related',
                    label: 'Related',
                    fields: {
                        pages: {
                            type: 'core/relations',
                            label: 'Pages',
                            options: { target: 'pages', fields: ['seo'] }
                        }
                    }
                } as any,
                'site/exhibit': {
                    type: 'site/exhibit',
                    label: 'Exhibit',
                    fields: {
                        exhibit: {
                            type: 'core/variant',
                            label: 'Exhibit',
                            options: {
                                variants: {
                                    image: { fields: { src: { type: 'core/text', label: 'Src' } } },
                                    link: { fields: { to: { type: 'core/link', label: 'To' } } }
                                }
                            }
                        }
                    }
                } as any
            },
            structures: {
                'site/cta': {
                    type: 'site/cta',
                    label: 'CTA',
                    fields: {
                        label: { type: 'core/text', label: 'Label' },
                        link: { type: 'core/link', label: 'Link' }
                    }
                } as any
            }
        }
    };
}

const fields: Record<string, Field> = {
    blocks: { type: 'core/block-list', label: 'Blocks' },
    footer: { type: 'core/link', label: 'Footer link' },
    next: { type: 'core/relation', label: 'Next', options: { target: 'pages' } },
    steps: {
        type: 'core/list',
        label: 'Steps',
        items: {
            type: 'core/object',
            label: 'Step',
            fields: { link: { type: 'core/link', label: 'Link' } }
        }
    } as Field
};

const live = { isLive: (p: { status: string }) => p.status === 'published' };

describe('resolvePageLinks', () => {
    it("gives a page link its page's address in every language", async () => {
        const out = await resolvePageLinks(
            { footer: { pageId: 'pricing', label: { en: 'Pricing' } } },
            fields,
            context(),
            live
        );
        expect(out!.footer).toEqual({
            pageId: 'pricing',
            label: { en: 'Pricing' },
            url: { en: '/pricing', fr: '/fr/tarifs' }
        });
    });

    it('gives one address with a locale, and replaces a stale url', async () => {
        const out = await resolvePageLinks(
            { footer: { pageId: 'pricing', url: '/old-pricing' } },
            fields,
            context(),
            { ...live, locale: 'fr' }
        );
        expect(out!.footer).toEqual({ pageId: 'pricing', url: '/fr/tarifs' });
    });

    it('marks a link to a missing, draft or folder page, without an address', async () => {
        for (const pageId of ['gone', 'draft', 'docs']) {
            const out = await resolvePageLinks(
                { footer: { pageId, url: '/x' } },
                fields,
                context(),
                live
            );
            expect(out!.footer).toEqual({ pageId, missing: true });
        }
        const preview = await resolvePageLinks({ footer: { pageId: 'draft' } }, fields, context(), {
            isLive: () => true
        });
        expect(preview!.footer).toEqual({ pageId: 'draft', url: { en: '/soon', fr: '/fr/soon' } });
    });

    it('leaves links to a URL as they are', async () => {
        const out = await resolvePageLinks(
            { footer: { url: 'https://studio.moteur.io' } },
            fields,
            context(),
            live
        );
        expect(out!.footer).toEqual({ url: 'https://studio.moteur.io' });
    });

    it('finds links inside blocks, structures, variants and lists', async () => {
        const out = await resolvePageLinks(
            {
                blocks: [
                    {
                        type: 'site/cta',
                        data: { primary: { label: 'See prices', link: { pageId: 'pricing' } } }
                    },
                    {
                        type: 'site/exhibit',
                        data: { exhibit: { kind: 'link', to: { pageId: 'forms' } } }
                    },
                    { type: 'site/unknown', data: { link: { pageId: 'forms' } } }
                ],
                steps: [{ link: { pageId: 'forms' } }]
            },
            fields,
            context(),
            { ...live, locale: 'en' }
        );
        const blocks = out!.blocks as any[];
        expect(blocks[0].data.primary.link.url).toBe('/pricing');
        expect(blocks[1].data.exhibit).toEqual({
            kind: 'link',
            to: { pageId: 'forms', url: '/forms' }
        });
        // A block the project doesn't define is passed through untouched.
        expect(blocks[2].data.link).toEqual({ pageId: 'forms' });
        expect((out!.steps as any[])[0].link.url).toBe('/forms');
    });

    it('turns page relations into summaries with the fields asked for, live pages only', async () => {
        const out = await resolvePageLinks(
            {
                blocks: [
                    {
                        type: 'site/related',
                        data: { pages: ['forms', { id: 'pricing' }, 'draft', 'gone'] }
                    }
                ],
                next: 'pricing'
            },
            fields,
            context(),
            { ...live, locale: 'en' }
        );
        expect((out!.blocks as any[])[0].data.pages).toEqual([
            {
                id: 'forms',
                label: 'Forms',
                url: '/forms',
                fields: { seo: { title: { en: 'Forms' } } }
            },
            {
                id: 'pricing',
                label: 'Pricing',
                url: '/pricing',
                fields: { seo: { title: { en: 'Pricing' } } }
            }
        ]);
        // No `fields` option: only who it is and where.
        expect(out!.next).toEqual({ id: 'pricing', label: 'Pricing', url: '/pricing' });
        const gone = await resolvePageLinks({ next: 'draft' }, fields, context(), live);
        expect(gone!.next).toBeNull();
    });

    it("brings a summary's fields down to the language asked for, by the page's template", async () => {
        const ctx = context();
        ctx.templates = new Map([
            [
                'page',
                {
                    id: 'page',
                    label: 'Page',
                    fields: {
                        seo: {
                            type: 'core/object',
                            label: 'SEO',
                            fields: {
                                title: {
                                    type: 'core/text',
                                    label: 'Title',
                                    options: { multilingual: true }
                                }
                            }
                        }
                    }
                } as any
            ]
        ]);
        const out = await resolvePageLinks(
            { next: 'pricing' },
            {
                next: { ...fields.next, options: { target: 'pages', fields: ['seo'] } }
            },
            ctx,
            { ...live, locale: 'fr' }
        );
        expect(out!.next).toEqual({
            id: 'pricing',
            label: 'Pricing',
            url: '/fr/tarifs',
            fields: { seo: { title: 'Pricing' } }
        });
    });

    it('keeps fields the schema does not know', async () => {
        const out = await resolvePageLinks(
            { extra: { pageId: 'pricing' } },
            fields,
            context(),
            live
        );
        expect(out!.extra).toEqual({ pageId: 'pricing' });
    });
});
