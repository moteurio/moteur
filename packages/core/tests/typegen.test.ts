import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import ts from 'typescript';
import { generateTypes, type TypegenInput } from '../src/typegen.js';

const input: TypegenInput = {
    projectId: 'moteur-io',
    defaultLocale: 'en',
    locales: ['fr'],
    structures: {
        'moteur-io/cta': {
            type: 'moteur-io/cta',
            label: 'Call to action',
            fields: {
                label: {
                    type: 'core/text',
                    label: 'Label',
                    options: { multilingual: true, required: true }
                },
                link: { type: 'core/link', label: 'Link' }
            }
        }
    },
    blocks: {
        'moteur-io/feature': {
            type: 'moteur-io/feature',
            label: { en: 'Feature', fr: 'Fonction' },
            fields: {
                title: { type: 'core/text', label: 'Title', options: { multilingual: true } },
                shot: { type: 'core/asset', label: 'Screenshot' },
                cta: {
                    type: 'core/structure',
                    label: 'CTA',
                    options: { structure: 'moteur-io/cta' }
                },
                exhibit: {
                    type: 'core/variant',
                    label: 'Exhibit',
                    options: {
                        variants: {
                            image: { fields: { src: { type: 'core/asset', label: 'Image' } } },
                            code: {
                                fields: {
                                    language: {
                                        type: 'core/select',
                                        label: 'Language',
                                        options: {
                                            choices: ['ts', { value: 'json' }],
                                            required: true
                                        }
                                    },
                                    code: { type: 'core/textarea', label: 'Code' }
                                }
                            }
                        }
                    }
                }
            }
        } as TypegenInput['blocks'][string],
        'core/text': {
            type: 'core/text',
            label: 'Text',
            fields: { body: { type: 'core/markdown', label: 'Body' } }
        } as TypegenInput['blocks'][string]
    },
    models: [
        {
            id: 'author',
            label: 'Author',
            fields: { name: { type: 'core/text', label: 'Name', options: { required: true } } }
        },
        {
            id: 'article',
            label: 'Article',
            fields: {
                title: { type: 'core/text', label: 'Title', options: { multilingual: true } },
                author: { type: 'core/relation', label: 'Author', options: { model: 'author' } },
                tags: {
                    type: 'core/list',
                    label: 'Tags',
                    options: { items: { type: 'core/text', label: 'Tag' } }
                },
                body: {
                    type: 'core/block-list',
                    label: 'Body',
                    options: { allowedBlockTypes: ['moteur-io/feature'] }
                },
                'reading-time': { type: 'core/number', label: 'Reading time' }
            }
        }
    ],
    templates: [
        {
            id: 'home',
            label: 'Home',
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
                },
                blocks: { type: 'core/block-list', label: 'Blocks' },
                next: {
                    type: 'core/relation',
                    label: 'Next',
                    options: { target: 'pages', fields: ['seo'] }
                }
            }
        }
    ] as TypegenInput['templates']
};

const packages = fileURLToPath(new URL('../..', import.meta.url));

/** Type-checks the generated file with code using it (and the real client); returns the errors. */
function check(usage: string): string[] {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-types-'));
    fs.writeFileSync(path.join(dir, 'moteur.ts'), generateTypes(input));
    fs.writeFileSync(path.join(dir, 'use.ts'), usage);
    const program = ts.createProgram([path.join(dir, 'use.ts')], {
        strict: true,
        noEmit: true,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        skipLibCheck: true,
        types: ['node'],
        typeRoots: [path.join(packages, 'core/node_modules/@types')],
        paths: {
            '@moteurio/client': [path.join(packages, 'client/src/index.ts')],
            '@moteurio/types': [path.join(packages, 'types/src/index.ts')],
            '@moteurio/types/*': [path.join(packages, 'types/src/*')]
        }
    });
    // Only what's wrong in the generated file and the code using it, not in the packages.
    const errors = ts
        .getPreEmitDiagnostics(program)
        .filter(d => !d.file || d.file.fileName.startsWith(dir.replace(/\\/g, '/')))
        .map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    fs.rmSync(dir, { recursive: true, force: true });
    return errors;
}

describe('generateTypes', () => {
    it('names types after schemas, dropping the project namespace', () => {
        const out = generateTypes(input);
        expect(out).toContain("export type Locale = 'en' | 'fr';".replace(/'/g, '"'));
        expect(out).toContain('export interface CtaStructure<');
        expect(out).toContain('export type FeatureBlock<');
        expect(out).toContain('export type CoreTextBlock<');
        expect(out).toContain('export type ArticleEntry<');
        expect(out).toContain('export type HomePage<');
        expect(out).toContain('/** Screenshot */');
    });

    it('compiles, and describes content as delivered', () => {
        expect(
            check(`
import type { ArticleEntry, HomePage, AnyPage, Models, FeatureBlock } from './moteur';

const stored: ArticleEntry = {
    id: 'a1',
    type: 'article',
    data: {
        title: { en: 'Hello', fr: 'Bonjour' },
        author: 'ada',
        tags: ['cms'],
        'reading-time': 4,
        body: [
            {
                type: 'moteur-io/feature',
                data: {
                    title: { en: 'Inbox' },
                    shot: { assetId: 'inbox' },
                    cta: { label: { en: 'Try' }, link: { pageId: 'pricing', url: { en: '/pricing' } } },
                    exhibit: { kind: 'code', language: 'json', code: '{}' }
                }
            }
        ]
    }
};

const french: ArticleEntry<'one'> = {
    id: 'a1',
    type: 'article',
    data: {
        title: 'Bonjour',
        author: { id: 'ada', type: 'author', data: { name: 'Ada' } },
        body: [{ type: 'moteur-io/feature', data: { cta: { label: 'Essayer', link: { url: '/fr/tarifs' } } } }]
    }
};

const home: HomePage<'one'> = {
    id: 'home', type: 'static', label: 'Home', slug: '', parentId: null, order: 0,
    templateId: 'home', status: 'published', path: '/fr', paths: { en: '/', fr: '/fr' }, navInclude: true, createdAt: '', updatedAt: '',
    fields: { seo: { title: 'Accueil' }, next: { id: 'pricing', label: 'Pricing', url: '/fr/tarifs', fields: { seo: { title: 'Tarifs' } } } }
};

function title(page: AnyPage<'one'>): string | undefined {
    if (page.templateId === 'home') return page.fields.seo?.title;
}

const feature = (b: FeatureBlock) => (b.data.exhibit?.kind === 'image' ? b.data.exhibit.src : null);
type AuthorName = Models['author']['data']['name'];
const name: AuthorName = 'Ada';
export { stored, french, home, title, feature, name };
`)
        ).toEqual([]);
    });

    it('catches content that does not fit', () => {
        const errors = check(`
import type { ArticleEntry } from './moteur';
const wrong: ArticleEntry<'one'> = {
    id: 'a1',
    type: 'article',
    data: {
        title: { en: 'Not one language' },
        body: [{ type: 'moteur-io/feature', data: { exhibit: { kind: 'code', language: 'python' } } }]
    }
};
export { wrong };
`);
        expect(errors.length).toBeGreaterThanOrEqual(2);
    });

    it('types the client: answers per model and page, in one language after locale()', () => {
        expect(
            check(`
import { createMoteurPublicClient } from '@moteurio/client';
import type { MoteurSchema } from './moteur';

const moteur = createMoteurPublicClient<MoteurSchema>({
    baseURL: 'https://api.moteur.io',
    auth: { type: 'apiKey', apiKey: 'k', projectId: 'moteur-io' }
});

export async function build() {
    const site = moteur.channel('site');
    const stored = await site.entries.get('article', 'a1');
    const title: { en?: string; fr?: string } | undefined = stored.data.title;

    const fr = moteur.locale('fr').channel('site');
    const article = await fr.entries.get('article', 'a1');
    const one: string | undefined = article.data.title;

    const asked = await site.entries.list('article', { locale: 'en' });
    const first: string | undefined = asked[0]?.data.title;

    for (const page of await fr.pages.list())
        if (page.templateId === 'home') {
            const seo: string | undefined = page.fields.seo?.title;
            const blocks = page.fields.blocks ?? [];
            for (const block of blocks) if (block.type === 'moteur-io/feature') block.data.title;
        }
    const menus = await fr.menus.list();
    const urls = await moteur.locale('fr').site.urls();
    return { title, one, first, menus, url: urls[0]?.url };
}
`)
        ).toEqual([]);
    });

    it('refuses what the project does not have', () => {
        const errors = check(`
import { createMoteurPublicClient } from '@moteurio/client';
import type { MoteurSchema } from './moteur';
const moteur = createMoteurPublicClient<MoteurSchema>({
    baseURL: 'x',
    auth: { type: 'apiKey', apiKey: 'k', projectId: 'p' }
});
export async function wrong() {
    await moteur.channel('site').entries.list('nope');
    moteur.locale('de');
    const a = await moteur.locale('fr').channel('site').entries.get('article', 'a1');
    const m: { en?: string } | undefined = a.data.title;
    return m;
}
`);
        expect(errors).toHaveLength(3);
    });
});
