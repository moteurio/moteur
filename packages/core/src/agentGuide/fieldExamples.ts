/**
 * One example per core field type: a definition as a schema (or an import bundle) gives it, and a
 * value it accepts, as stored and as a bundle sends it. tests/agentGuide.test.ts checks every one
 * against the validators, and that every registered type has one, so the skill's field reference
 * (skills/moteur/references/fields.md, written from these) can't drift from the code.
 */
import type { Field } from '@moteurio/types/Field.js';

export type FieldExample = {
    /** The field as a schema's `fields.<name>` holds it. */
    field: Field;
    /** A value it accepts. */
    value: unknown;
    /** What to know about the value, in one or two sentences. */
    note?: string;
};

/** A shared structure the examples use (`core/structure`). */
export const EXAMPLE_STRUCTURES = {
    cta: {
        type: 'cta',
        label: 'Call to action',
        fields: {
            label: { type: 'core/text', label: 'Label', options: { multilingual: true } },
            link: { type: 'core/link', label: 'Link' }
        }
    }
} as const;

const DAST = (text: string) => ({
    schema: 'dast',
    document: {
        type: 'root',
        children: [{ type: 'paragraph', children: [{ type: 'span', value: text }] }]
    }
});

export const FIELD_EXAMPLES: Record<string, FieldExample> = {
    'core/text': {
        field: {
            type: 'core/text',
            label: 'Title',
            options: { required: true, multilingual: true, maxLength: 120 }
        },
        value: { en: 'The inbox', fr: 'La boîte' },
        note: 'A string, or one per language when the field is multilingual.'
    },
    'core/textarea': {
        field: { type: 'core/textarea', label: 'Summary', options: { multilingual: true } },
        value: { en: 'Two lines\nof text.' }
    },
    'core/markdown': {
        field: { type: 'core/markdown', label: 'Body', options: { multilingual: true } },
        value: { en: 'Some **bold** words. See [our prices](page:pricing).' },
        note: 'CommonMark. `[words](page:<page id>)` links to a page and follows it on delivery.'
    },
    'core/rich-text': {
        field: { type: 'core/rich-text', label: 'Story' },
        value: DAST('Hello.'),
        note: 'A DAST document. One per language: `{ "dast": { "en": doc, "fr": doc } }`. A link to a page names it in its meta: `{ "type": "link", "url": "/pricing", "meta": [{ "id": "pageId", "value": "pricing" }], "children": […] }`. An import may give `{ "html": "<p>…</p>" }` (or one per language) instead: it is converted.'
    },
    'core/html': {
        field: { type: 'core/html', label: 'Embed code' },
        value: '<p>Raw <strong>HTML</strong>, sanitized.</p>'
    },
    'core/number': {
        field: { type: 'core/number', label: 'Seats', options: { min: 1, max: 500 } },
        value: 12
    },
    'core/boolean': {
        field: { type: 'core/boolean', label: 'Featured' },
        value: true
    },
    'core/select': {
        field: {
            type: 'core/select',
            label: 'Size',
            options: {
                choices: [
                    { value: 'small', label: { en: 'Small', fr: 'Petit' } },
                    { value: 'large', label: { en: 'Large', fr: 'Grand' } }
                ]
            }
        },
        value: 'small',
        note: 'The chosen value.'
    },
    'core/multi-select': {
        field: {
            type: 'core/multi-select',
            label: 'Readers',
            options: {
                choices: [
                    { value: 'writer', label: 'Writer' },
                    { value: 'developer', label: 'Developer' }
                ]
            }
        },
        value: ['writer', 'developer']
    },
    'core/date': {
        field: { type: 'core/date', label: 'Day' },
        value: '2026-11-02'
    },
    'core/datetime': {
        field: { type: 'core/datetime', label: 'Starts' },
        value: '2026-11-02T18:30:00Z'
    },
    'core/time': {
        field: { type: 'core/time', label: 'Opens' },
        value: '09:30'
    },
    'core/email': {
        field: { type: 'core/email', label: 'Email' },
        value: 'ada@example.com'
    },
    'core/phone': {
        field: { type: 'core/phone', label: 'Phone' },
        value: '+1 514 555 0100'
    },
    'core/url': {
        field: { type: 'core/url', label: 'Website' },
        value: 'https://example.com'
    },
    'core/link': {
        field: { type: 'core/link', label: 'Read more' },
        value: { pageId: 'pricing', label: { en: 'See prices', fr: 'Voir les prix' } },
        note: 'To a page: `pageId` (its `url` is filled in on delivery, in each language). To an address: `url`. In a bundle, `pageId` may be `{ "$ref": "page:pricing" }`.'
    },
    'core/color': {
        field: { type: 'core/color', label: 'Accent' },
        value: '#d9480f'
    },
    'core/icon': {
        field: { type: 'core/icon', label: 'Icon' },
        value: 'inbox'
    },
    'core/slug': {
        field: { type: 'core/slug', label: 'Slug', options: { sourceField: 'title' } },
        value: 'the-inbox'
    },
    'core/id': {
        field: { type: 'core/id', label: 'Id' },
        value: '0f8fad5b-d9cb-469f-a165-70867728950e',
        note: 'Made by Moteur, never written.'
    },
    'core/order': {
        field: { type: 'core/order', label: 'Order' },
        value: 3
    },
    'core/status': {
        field: { type: 'core/status', label: 'Stage' },
        value: 'draft',
        note: "A workflow stage of the model's own. `options.values` lists them (not `choices`). Not the entry's publication, which is its `status`."
    },
    'core/json': {
        field: { type: 'core/json', label: 'Settings' },
        value: { theme: 'dark', columns: 3 },
        note: 'Any JSON. Prefer a typed field: core/object, core/list, core/map.'
    },
    'core/object': {
        field: {
            type: 'core/object',
            label: 'Author',
            fields: {
                name: { type: 'core/text', label: 'Name', options: { required: true } },
                role: { type: 'core/text', label: 'Role' }
            }
        } as Field,
        value: { name: 'Ada', role: 'Editor' },
        note: 'Its fields go in `fields` (beside `type`, not in `options`).'
    },
    'core/list': {
        field: {
            type: 'core/list',
            label: 'Steps',
            items: { type: 'core/text', label: 'Step' },
            options: { minItems: 1 }
        } as Field,
        value: ['Write', 'Review', 'Publish'],
        note: 'The item field goes in `items`, beside `type` (not in `options`). An item may be a core/object.'
    },
    'core/map': {
        field: {
            type: 'core/map',
            label: 'Answers',
            options: { value: { type: 'core/text', label: 'Answer' }, keys: ['yes', 'no'] }
        },
        value: { yes: 'Right', no: 'Not yet' },
        note: 'Keys to values of one field type (`options.value`). `options.keys` lists the keys allowed, or any key without it.'
    },
    'core/structure': {
        field: { type: 'core/structure', label: 'Call to action', options: { structure: 'cta' } },
        value: { label: { en: 'Try it' }, link: { url: 'https://example.com' } },
        note: "The fields of a shared structure (`options.structure`: the project's `cta`, the server's `core/seo`)."
    },
    'core/variant': {
        field: {
            type: 'core/variant',
            label: 'Exhibit',
            options: {
                variants: {
                    image: {
                        label: 'Picture',
                        fields: { picture: { type: 'core/asset', label: 'Picture' } }
                    },
                    code: {
                        label: 'Code',
                        fields: { code: { type: 'core/textarea', label: 'Code' } }
                    }
                }
            }
        },
        value: { kind: 'code', code: 'moteur imports run site.json' },
        note: 'One of several shapes: `kind` names it, its fields sit beside it.'
    },
    'core/relation': {
        field: { type: 'core/relation', label: 'Author', options: { model: 'author' } },
        value: 'ada',
        note: 'An entry\'s id (in a bundle, `{ "$ref": "entry:author/ada" }`). With `target: "pages"`, a page\'s id.'
    },
    'core/relations': {
        field: { type: 'core/relations', label: 'Related', options: { target: 'pages' } },
        value: ['pricing', 'about'],
        note: 'Ids, in order. Delivered pages come as `{ id, label, url }`.'
    },
    'core/categories': {
        field: { type: 'core/categories', label: 'Categories', options: { source: 'category' } },
        value: ['news', 'product']
    },
    'core/tags': {
        field: { type: 'core/tags', label: 'Tags', options: { source: 'tag' } },
        value: ['cms', 'git'],
        note: '`options.source` is required.'
    },
    'core/asset': {
        field: { type: 'core/asset', label: 'Picture' },
        value: { assetId: 'a1b2c3', alt: { en: 'The inbox' } },
        note: 'A file of the media library: `assetId` (in a bundle, `{ "$ref": "asset:<ref>" }`), with alt and caption for this use.'
    },
    'core/asset-list': {
        field: { type: 'core/asset-list', label: 'Gallery', options: { maxItems: 12 } },
        value: [{ assetId: 'a1b2c3' }, { assetId: 'd4e5f6', caption: { en: 'Later' } }]
    },
    'core/image': {
        field: { type: 'core/image', label: 'Image by address' },
        value: { src: 'https://example.com/inbox.png', alt: { en: 'The inbox' } },
        note: 'A picture by address. For the media library, use core/asset.'
    },
    'core/media-image': {
        field: { type: 'core/media-image', label: 'Image file' },
        value: { src: 'https://example.com/inbox.png' }
    },
    'core/audio': {
        field: { type: 'core/audio', label: 'Episode' },
        value: { assetId: 'a7b8c9', title: 'Episode 1' },
        note: '`assetId` (media library) or `src` (an address).'
    },
    'core/video': {
        field: { type: 'core/video', label: 'Clip' },
        value: { provider: 'youtube', target: 'dQw4w9WgXcQ', title: 'A clip' },
        note: 'A video at a provider: `provider` and its `target` id.'
    },
    'core/model-3d': {
        field: { type: 'core/model-3d', label: 'Model' },
        value: { src: 'https://example.com/chair.glb', alt: 'A chair' }
    },
    'core/address': {
        field: { type: 'core/address', label: 'Address' },
        value: {
            street: '1 Main St',
            city: 'Montréal',
            state: 'QC',
            country: 'CA',
            postalCode: 'H2X 1Y4'
        }
    },
    'core/table': {
        field: { type: 'core/table', label: 'Prices' },
        value: {
            rows: [
                ['Free', '0'],
                ['Pro', '39']
            ]
        },
        note: 'Rows of cells, with optional `rowTitles` and `columnTitles`.'
    },
    'core/block-list': {
        field: {
            type: 'core/block-list',
            label: 'Blocks',
            options: { allowedBlockTypes: ['core/hero', 'hero'] }
        },
        value: [{ type: 'core/hero', data: { title: { en: 'Moteur' } } }],
        note: "Blocks in order: `{ type, data }`. A project's own block is named without a slash (`hero`), the server's with one (`core/hero`). `data` holds only the block's fields."
    },
    'core/layout': {
        field: {
            type: 'core/layout',
            label: 'Regions',
            options: { defaultLayoutId: 'two-columns' }
        },
        value: [],
        note: 'Blocks placed in the slots of a project Layout. Most sites use core/block-list.'
    }
};
