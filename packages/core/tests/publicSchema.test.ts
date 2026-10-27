import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/apiCollections.js', () => ({ getCollection: vi.fn() }));
vi.mock('../src/models.js', () => ({ getModelSchemaForProject: vi.fn() }));
vi.mock('../src/templates.js', () => ({ listTemplates: vi.fn() }));
vi.mock('../src/blocks.js', () => ({ listBlocks: vi.fn() }));
vi.mock('../src/structures.js', () => ({
    listStructures: vi.fn(),
    findStructure: (r: Record<string, unknown>, id: string) => r[id]
}));
vi.mock('../src/projects.js', () => ({
    getProjectById: vi.fn(async () => ({ defaultLocale: 'en', supportedLocales: ['fr'] }))
}));
vi.mock('../src/utils/projectStorage.js', () => ({
    listProjectKeys: vi.fn(async () => ['rival'])
}));

import { getCollection } from '../src/apiCollections.js';
import { getModelSchemaForProject } from '../src/models.js';
import { listTemplates } from '../src/templates.js';
import { listBlocks } from '../src/blocks.js';
import { listStructures } from '../src/structures.js';
import { channelSchema, schemaTypes } from '../src/publicSchema.js';

const collection = (resources: unknown[]) =>
    ({ id: 'site', projectId: 'moteur-io', label: 'Site', resources }) as never;

const rival = {
    id: 'rival',
    label: { en: 'Rival' },
    studio: { layout: 'secret' },
    meta: { audit: { createdBy: 'someone' } },
    fields: {
        name: {
            type: 'core/text',
            label: 'Name',
            options: { required: true, ui: 'big', placeholder: 'Sanity' }
        },
        pricing: {
            type: 'core/select',
            label: { en: 'Pricing model' },
            options: {
                choices: [{ value: 'seat', label: { en: 'Per seat' } }],
                aiPrompt: 'private'
            }
        },
        notes: { type: 'core/textarea', label: 'Internal notes' }
    }
};

const blocks = {
    'moteur-io/hero': {
        type: 'moteur-io/hero',
        label: 'Hero',
        fields: {
            title: { type: 'core/text', label: 'Title', options: { multilingual: true } },
            primary: {
                type: 'core/structure',
                label: 'Button',
                options: { structure: 'moteur-io/cta' }
            }
        }
    },
    'moteur-io/faq': { type: 'moteur-io/faq', label: 'FAQ', fields: {} },
    'core/note': { type: 'core/note', label: 'Note', editorial: true, fields: {} }
};

const structures = {
    'moteur-io/cta': {
        type: 'moteur-io/cta',
        label: 'Call to action',
        fields: {
            label: { type: 'core/text', label: 'Label' },
            link: { type: 'core/link', label: 'Link' }
        }
    },
    'moteur-io/unused': { type: 'moteur-io/unused', label: 'Unused', fields: {} }
};

const page = {
    id: 'page',
    projectId: 'moteur-io',
    label: 'Page',
    fields: {
        blocks: {
            type: 'core/block-list',
            label: 'Blocks',
            options: { allowedBlockTypes: ['moteur-io/hero', 'core/note'], ui: 'cards' }
        }
    }
};

describe('a channel’s public schema', () => {
    beforeEach(() => {
        vi.mocked(getModelSchemaForProject).mockResolvedValue(rival as never);
        vi.mocked(listTemplates).mockResolvedValue([
            page,
            { ...page, id: 'legal', label: 'Legal' }
        ] as never);
        vi.mocked(listBlocks).mockReturnValue(blocks as never);
        vi.mocked(listStructures).mockResolvedValue(structures as never);
    });

    it('describes models with only the fields the channel gives, and only public options', async () => {
        vi.mocked(getCollection).mockResolvedValue(
            collection([
                { resourceType: 'model', resourceId: 'rival', fields: ['name', 'pricing'] }
            ])
        );
        const s = (await channelSchema('moteur-io', 'site'))!;
        expect(s.locales).toEqual(['en', 'fr']);
        expect(s.models.rival).toEqual({
            id: 'rival',
            label: { en: 'Rival' },
            fields: {
                name: { type: 'core/text', label: 'Name', options: { required: true } },
                pricing: {
                    type: 'core/select',
                    label: { en: 'Pricing model' },
                    options: { choices: [{ value: 'seat', label: { en: 'Per seat' } }] }
                }
            }
        });
        expect(s.templates).toEqual({});
        expect(s.blocks).toEqual({});
    });

    it('describes the templates of its pages, and the blocks and structures they use', async () => {
        vi.mocked(getCollection).mockResolvedValue(
            collection([{ resourceType: 'page', resourceId: 'page' }])
        );
        const s = (await channelSchema('moteur-io', 'site'))!;
        expect(Object.keys(s.templates)).toEqual(['page']);
        expect(s.templates.page!.fields.blocks!.options).toEqual({
            allowedBlockTypes: ['moteur-io/hero']
        });
        // The hero only: the FAQ isn't allowed, the note is editorial.
        expect(Object.keys(s.blocks)).toEqual(['moteur-io/hero']);
        expect(Object.keys(s.structures)).toEqual(['moteur-io/cta']);
    });

    it('gives every template for every page, and a version that follows the schemas', async () => {
        vi.mocked(getCollection).mockResolvedValue(
            collection([{ resourceType: 'page', resourceId: 'pages' }])
        );
        const before = (await channelSchema('moteur-io', 'site'))!;
        expect(Object.keys(before.templates)).toEqual(['legal', 'page']);
        expect((await channelSchema('moteur-io', 'site'))!.version).toBe(before.version);

        vi.mocked(listStructures).mockResolvedValue({
            ...structures,
            'moteur-io/cta': { ...structures['moteur-io/cta'], label: 'Button' }
        } as never);
        expect((await channelSchema('moteur-io', 'site'))!.version).not.toBe(before.version);
    });

    it('is null for a channel that does not exist', async () => {
        vi.mocked(getCollection).mockResolvedValue(null);
        expect(await channelSchema('moteur-io', 'nope')).toBeNull();
    });

    it('makes the same kind of types as the project’s schemas', async () => {
        vi.mocked(getCollection).mockResolvedValue(
            collection([
                { resourceType: 'model', resourceId: 'models' },
                { resourceType: 'page', resourceId: 'page' }
            ])
        );
        const ts = schemaTypes((await channelSchema('moteur-io', 'site'))!);
        expect(ts).toContain('export interface HeroBlockData');
        expect(ts).toContain('export interface CtaStructure');
        expect(ts).toContain('pricing?: "seat"');
        expect(ts).toContain('export interface MoteurSchema');
        expect(ts).toContain('notes?: string');
    });
});
