import type { ModelSchema } from '@moteurio/types/Model.js';
import type { Field } from '@moteurio/types/Field.js';
import { f } from '../runtime/fields.js';

/**
 * Fixtures: models built to stress the Studio and the API, not to look good. Every core field
 * type, extreme sizes, odd relations, legacy formats and empty states.
 */

const ml = { multilingual: true };

/** One field of every core type, all optional. */
export const everyField: Record<string, Field> = {
    title: f.text('Title', { required: true, maxLength: 120 }),
    text: f.text('Text', ml),
    textarea: f.textarea('Textarea', ml),
    richText: f.richText('Rich text', ml),
    markdown: f.markdown('Markdown', ml),
    html: f.html('HTML', ml),
    slug: f.slug('Slug', 'title', ml),
    number: f.number('Number'),
    boolean: f.boolean('Boolean'),
    date: f.date('Date'),
    datetime: f.datetime('Date and time'),
    time: f.time('Time'),
    color: f.color('Colour'),
    email: f.email('Email'),
    phone: f.phone('Phone'),
    url: f.url('URL'),
    link: f.link('Link'),
    icon: f.icon('Icon'),
    id: f.id('ID'),
    json: f.json('JSON'),
    tags: f.tags('Tags'),
    categories: f.categories('Categories', 'category'),
    order: f.order(),
    status: f.status('Status', { choices: ['draft', 'review', 'live'] }),
    select: f.select('Select', ['alpha', 'beta', 'gamma']),
    multiSelect: f.multiSelect('Multi-select', ['red', 'green', 'blue']),
    address: f.address('Address'),
    image: f.image('Image'),
    asset: f.asset('Asset'),
    assetList: f.assetList('Asset list'),
    video: f.video('Video'),
    model3d: f.model3d('3D model'),
    table: f.table('Table'),
    layout: f.layout('Layout'),
    structure: f.structure('SEO', 'core/seo'),
    relation: f.relation('Relation', 'kitchen-sink'),
    relations: f.relations('Relations', 'kitchen-sink'),
    object: f.object('Object', {
        label: f.text('Label', ml),
        value: f.number('Value'),
        nested: f.object('Nested', { deep: f.text('Deep') })
    }),
    list: f.list('List', f.object('Item', { name: f.text('Name'), count: f.number('Count') })),
    blocks: f.blocks('Blocks')
};

const required = (fields: Record<string, Field>): Record<string, Field> =>
    Object.fromEntries(
        Object.entries(fields).map(([k, v]) => [
            k,
            { ...v, options: { ...(v.options ?? {}), required: true } } as Field
        ])
    );

export const models: ModelSchema[] = [
    {
        id: 'kitchen-sink',
        label: 'Kitchen sink',
        description: 'One field of every core type, all optional.',
        modelType: 'content',
        fields: everyField
    },
    {
        id: 'all-required',
        label: 'All required',
        description: 'The same fields, all required.',
        modelType: 'content',
        fields: required(
            Object.fromEntries(
                Object.entries(everyField).filter(
                    ([k]) => !['id', 'blocks', 'relation', 'relations'].includes(k)
                )
            )
        )
    },
    {
        id: 'wide',
        label: 'Very wide model',
        description: 'Sixty fields: long forms and wide tables.',
        modelType: 'content',
        fields: Object.fromEntries(
            Array.from({ length: 60 }, (_, i) => [
                `field${String(i + 1).padStart(2, '0')}`,
                i % 3 === 0
                    ? f.text(`Field ${i + 1}`, ml)
                    : i % 3 === 1
                      ? f.number(`Field ${i + 1}`)
                      : f.boolean(`Field ${i + 1}`)
            ])
        )
    },
    {
        id: 'single-field',
        label: 'Single field',
        description: 'One field, for minimal forms.',
        modelType: 'content',
        fields: { name: f.text('Name', { required: true }) }
    },
    {
        id: 'empty',
        label: 'Empty model',
        description: 'No entries, ever.',
        modelType: 'content',
        fields: { title: f.text('Title') }
    },
    {
        id: 'no-fields',
        label: 'Model without fields',
        description: 'A model with no fields at all.',
        modelType: 'content',
        fields: {}
    },
    {
        id: 'localized',
        label: 'Localized',
        description: 'Multilingual fields across five locales, including right-to-left and CJK.',
        modelType: 'content',
        fields: {
            title: f.text('Title', { multilingual: true, required: true }),
            body: f.richText('Body', ml),
            slug: f.slug('Slug', 'title', ml),
            note: f.textarea('Note', ml)
        }
    },
    {
        id: 'legacy',
        label: 'Legacy formats',
        description: 'Data in formats older code wrote. Several entries are invalid on purpose.',
        modelType: 'content',
        fields: {
            title: f.text('Title', ml),
            body: f.richText('Body', ml),
            slug: f.slug('Slug', 'title', ml),
            blocks: f.blocks('Blocks'),
            when: f.date('Date')
        }
    },
    {
        id: 'category',
        label: 'Category',
        description: 'A taxonomy with a parent hierarchy.',
        modelType: 'taxonomy',
        fields: {
            name: f.text('Name', { required: true }),
            parent: f.relation('Parent', 'category')
        }
    },
    {
        id: 'note',
        label: 'Note',
        description: 'User-submitted data (model type userData).',
        modelType: 'userData',
        fields: { body: f.textarea('Body', { required: true }), author: f.email('Author') }
    }
];
