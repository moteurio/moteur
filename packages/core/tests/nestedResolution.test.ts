import { describe, it, expect, vi } from 'vitest';
import '../src/fields/index.js';

vi.mock('../src/assets/assetService.js', () => ({
    getAsset: vi.fn(async (_p: string, id: string) =>
        id === 'inbox' ? { id, alt: 'The inbox', caption: '', resizeUrl: '/r?id=inbox' } : null
    )
}));

import { validateFieldValue } from '../src/validators/validateFieldValue.js';
import { resolveEntryReferences, type ReferenceSchemas } from '../src/referenceResolution.js';
import { resolveEntryAssets } from '../src/assets/assetResolver.js';
import { localizeEntry, localizeFields, type LocaleSchemas } from '../src/entryLocaleResolution.js';
import { referencesIn } from '../src/contentReferences.js';
import { pageLinkViolations } from '../src/radar/rules/page-links.js';
import { brokenRelation } from '../src/radar/rules/broken-relation.js';
import type { Field } from '@moteurio/types/Field.js';
import type { Entry, ModelSchema } from '@moteurio/types/Model.js';
import type { RadarGraph } from '@moteurio/types/Radar.js';

/** A project with a "cta" structure, a "feature" block, and articles relating to authors. */
const schemas: LocaleSchemas = {
    structures: {
        'moteur-io/cta': {
            type: 'moteur-io/cta',
            label: 'CTA',
            fields: {
                label: { type: 'core/text', label: 'Label', options: { multilingual: true } },
                link: { type: 'core/link', label: 'Link' }
            }
        }
    },
    blocks: {
        'moteur-io/feature': {
            type: 'moteur-io/feature',
            label: 'Feature',
            fields: {
                title: { type: 'core/text', label: 'Title', options: { multilingual: true } },
                shot: { type: 'core/asset', label: 'Screenshot' },
                cta: {
                    type: 'core/structure',
                    label: 'CTA',
                    options: { structure: 'moteur-io/cta' }
                },
                author: { type: 'core/relation', label: 'Author', options: { model: 'author' } }
            }
        }
    } as LocaleSchemas['blocks'],
    model: async id => models[id] ?? null
};

const models: Record<string, ModelSchema> = {
    article: {
        id: 'article',
        label: 'Article',
        fields: {
            title: { type: 'core/text', label: 'Title', options: { multilingual: true } },
            author: { type: 'core/relation', label: 'Author', options: { model: 'author' } },
            body: { type: 'core/block-list', label: 'Body' }
        }
    },
    author: {
        id: 'author',
        label: 'Author',
        fields: { bio: { type: 'core/text', label: 'Bio', options: { multilingual: true } } }
    }
};

const authors: Record<string, Entry> = {
    ada: {
        id: 'ada',
        type: 'author',
        status: 'published',
        data: { bio: { en: 'Hi', fr: 'Salut' } }
    },
    bob: { id: 'bob', type: 'author', status: 'draft', data: { bio: { en: 'Draft' } } }
};

const article: Entry = {
    id: 'a1',
    type: 'article',
    status: 'published',
    data: {
        title: { en: 'Hello', fr: 'Bonjour' },
        author: 'ada',
        body: [
            {
                type: 'moteur-io/feature',
                data: {
                    title: { en: 'Inbox', fr: 'Boîte' },
                    shot: { assetId: 'inbox' },
                    cta: { label: { en: 'Try', fr: 'Essayer' }, link: { pageId: 'pricing' } },
                    author: 'bob'
                }
            }
        ]
    }
};

const references: ReferenceSchemas = { model: schemas.model!, walk: schemas };
const resolver = async (_p: string, modelId: string, id: string) =>
    modelId === 'author' ? (authors[id] ?? null) : null;

describe('project structures in validation', () => {
    const field: Field = {
        type: 'core/structure',
        label: 'CTA',
        options: { structure: 'moteur-io/cta' }
    };

    it('finds a project structure given in the context', () => {
        const value = { label: { en: 'Try' }, link: { pageId: 'pricing' } };
        expect(validateFieldValue(value, field, 'x', { structures: schemas.structures })).toEqual(
            []
        );
    });

    it('still reports a structure the project does not have', () => {
        const issues = validateFieldValue({}, field, 'x', { structures: {} });
        expect(issues.map(i => i.code)).toEqual(['STRUCTURE_SCHEMA_NOT_FOUND']);
    });

    it('reaches structures inside other fields', () => {
        const list: Field = { type: 'core/list', label: 'CTAs', options: { items: field } };
        const issues = validateFieldValue([{ label: { en: 'Try' } }, 'nope'], list, 'ctas', {
            structures: schemas.structures
        });
        expect(issues.map(i => [i.code, i.path])).toEqual([
            ['STRUCTURE_INVALID_CONTENT', 'ctas[1]']
        ]);
    });
});

describe('relations stored as plain ids', () => {
    it('resolve by the schema, at any depth, keeping drafts out', async () => {
        const out = await resolveEntryReferences(
            article,
            'p',
            'article',
            1,
            new Set(),
            ['published'],
            resolver,
            references
        );
        expect(out.data.author).toMatchObject({ id: 'ada', data: { bio: { fr: 'Salut' } } });
        // Bob is a draft: his id stays.
        expect(out.data.body[0].data.author).toBe('bob');
    });

    it('resolve in blocks when the target is live', async () => {
        const out = await resolveEntryReferences(
            article,
            'p',
            'article',
            1,
            new Set(),
            ['published', 'draft'],
            resolver,
            references
        );
        expect(out.data.body[0].data.author).toMatchObject({ id: 'bob' });
    });

    it('stay as they are without a schema', async () => {
        const out = await resolveEntryReferences(
            article,
            'p',
            'article',
            1,
            new Set(),
            [],
            resolver
        );
        expect(out.data.author).toBe('ada');
    });
});

describe('assets inside blocks', () => {
    it('resolve wherever they sit', async () => {
        const out = await resolveEntryAssets('p', article, models.article, schemas);
        expect(out.data.body[0].data.shot).toMatchObject({
            assetId: 'inbox',
            alt: 'The inbox',
            _resolved: { id: 'inbox' }
        });
    });
});

describe('one language at any depth', () => {
    it('brings blocks, structures, links and inlined entries down to the language', async () => {
        const inlined = await resolveEntryReferences(
            article,
            'p',
            'article',
            1,
            new Set(),
            ['published'],
            resolver,
            references
        );
        const out = await localizeEntry(inlined, schemas, { locale: 'fr', fallback: 'en' });
        expect(out.data.title).toBe('Bonjour');
        expect(out.data.author.data.bio).toBe('Salut');
        const feature = out.data.body[0].data;
        expect(feature.title).toBe('Boîte');
        expect(feature.cta.label).toBe('Essayer');
    });

    it('falls back to the default language', async () => {
        const out = await localizeFields(
            { title: { en: 'Only English' } },
            models.article.fields,
            schemas,
            { locale: 'fr', fallback: 'en' }
        );
        expect(out?.title).toBe('Only English');
    });
});

describe('references and Radar', () => {
    it('finds links to pages and relations, at any depth', async () => {
        const refs = await referencesIn(
            {
                kind: 'entry',
                id: 'a1',
                modelId: 'article',
                values: article.data,
                fields: models.article.fields
            },
            schemas
        );
        expect(refs.map(r => [r.path, r.via, r.to])).toEqual([
            ['author', 'relation', { kind: 'entry', modelId: 'author', id: 'ada' }],
            ['body[0].data.cta.link', 'link', { kind: 'page', id: 'pricing' }],
            ['body[0].data.author', 'relation', { kind: 'entry', modelId: 'author', id: 'bob' }]
        ]);
    });

    const graphWith = async (pages: RadarGraph['pages']): Promise<RadarGraph> => ({
        entries: new Map([['a1', { slug: 'a1', modelId: 'article', data: article.data }]]),
        models: new Map([['article', { id: 'article', fields: models.article.fields }]]),
        referrers: new Map(),
        locales: ['en'],
        pages,
        references: await referencesIn(
            {
                kind: 'entry',
                id: 'a1',
                modelId: 'article',
                values: article.data,
                fields: models.article.fields
            },
            schemas
        )
    });

    it('flags a link to a page that is gone, or not published', async () => {
        const gone = pageLinkViolations(await graphWith(new Map()));
        expect(gone).toMatchObject([
            {
                ruleId: 'broken-page-link',
                severity: 'error',
                entrySlug: 'a1',
                modelSlug: 'article',
                fieldPath: 'body[0].data.cta.link'
            }
        ]);
        const draft = pageLinkViolations(
            await graphWith(
                new Map([
                    [
                        'pricing',
                        { id: 'pricing', label: 'Pricing', type: 'static', status: 'draft' }
                    ]
                ])
            )
        );
        expect(draft).toMatchObject([{ ruleId: 'page-link-to-draft', severity: 'warning' }]);
        const live = pageLinkViolations(
            await graphWith(
                new Map([
                    [
                        'pricing',
                        { id: 'pricing', label: 'Pricing', type: 'static', status: 'published' }
                    ]
                ])
            )
        );
        expect(live).toEqual([]);
    });

    it('flags relations stored as plain ids that point nowhere', async () => {
        const graph = await graphWith(new Map());
        const violations = brokenRelation({
            entry: { slug: 'a1', modelId: 'article', data: article.data },
            model: { id: 'article', fields: models.article.fields },
            graph,
            locales: ['en']
        });
        expect(violations.map(v => v.fieldPath)).toEqual(['author', 'body[0].data.author']);
    });
});
