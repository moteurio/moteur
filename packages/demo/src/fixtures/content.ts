import type { SourceEntry } from '../runtime/types.js';

/**
 * Fixture entries. Strings here are deliberately awkward: they are what real content looks
 * like at its worst, and what the Studio and API must survive.
 */

export const STRINGS = {
    emoji: 'Robots 🤖🦾 au café ☕ — famille 👩‍👩‍👧‍👦, drapeau 🇨🇦, peau 👋🏽',
    rtl: 'مرحبا بالعالم — نص من اليمين إلى اليسار مع رقم 1968 وكلمة English',
    cjk: '日本語のテキスト。ロボットは喫茶店でコーヒーを運びます。漢字、ひらがな、カタカナ。',
    combining: 'Café vs Café — é (composé) / é (précomposé); Z̴̧͝a̷l̶g̸o̵',
    zeroWidth: 'zero​width‌joiner‍ and non-breaking spaces﻿',
    whitespace: '   leading and trailing spaces, \t tabs and\nnewlines   ',
    injection:
        '<script>alert("xss")</script><img src=x onerror=alert(1)> {{constructor}} ${process.env.SECRET} \'; DROP TABLE entries;-- ../../etc/passwd',
    markdownInPlain: '**not bold** _not italic_ [not a link](http://example.com) # not a heading',
    longWord: 'Pneumonoultramicroscopicsilicovolcanoconiosis'.repeat(4),
    quotes: '« guillemets » "straight" “curly” ‘single’ `backticks` \\backslash\\'
};

const LONG_PARAGRAPH =
    'Lorem robotum dolor sit amet, consectetur adipiscing machina. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ';

const ALL_FILLED: Record<string, unknown> = {
    title: 'Every field filled',
    text: {
        en: 'Plain text',
        fr: 'Texte simple',
        ar: 'نص',
        ja: 'テキスト',
        'fr-CA': 'Texte (Québec)'
    },
    textarea: { en: 'Line one\nLine two\n\nAfter a blank line.' },
    richText: {
        en: '## Heading\n\nA paragraph with **bold**, *italic*, __underline__, ~~strike~~, `code` and a [link](https://example.com).\n\n- one\n- two\n\n1. first\n2. second\n\n> A quote\n\n```js\nconsole.log("code block");\n```\n\n---\n\nThe end.'
    },
    markdown: {
        en: '# Markdown\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n![image](https://example.com/x.png)'
    },
    html: {
        html: {
            en: '<p>Paragraph with <strong>strong</strong> and <a href="https://example.com">a link</a>.</p><ul><li>item</li></ul>'
        }
    },
    slug: { en: 'every-field-filled', fr: 'tous-les-champs' },
    number: 42.5,
    boolean: true,
    date: '2024-02-29',
    datetime: '2024-02-29T23:59:59.999Z',
    time: '23:59',
    color: '#ff00aa',
    email: 'first.last+tag@sub.example.co.uk',
    phone: '+1 (514) 555-0100 ext. 42',
    url: 'https://example.com/path?query=1&b=2#fragment',
    link: { url: 'https://example.com', label: 'Example' },
    icon: 'lucide:rocket',
    json: { nested: { array: [1, 'two', null, true, { deep: [] }] }, unicode: '✓', empty: {} },
    tags: ['one', 'two', 'three'],
    categories: ['root', 'child'],
    order: 3,
    status: 'review',
    select: 'beta',
    multiSelect: ['red', 'blue'],
    address: {
        street: '1 Rue de l’Exemple, app. 4',
        city: 'Montréal',
        state: 'QC',
        country: 'CA',
        postalCode: 'H2X 1Y4'
    },
    image: { art: 'landscape' },
    asset: { art: 'landscape', caption: 'Asset caption' },
    assetList: [{ art: 'landscape' }, { art: 'portrait' }, { art: 'tiny' }, { art: 'transparent' }],
    video: { provider: 'youtube', target: 'dQw4w9WgXcQ', title: 'A video' },
    model3d: { src: 'https://example.com/models/robot.glb' },
    table: {
        value: {
            columnTitles: ['A', 'B', 'C'],
            rows: [
                ['1', '2', '3'],
                ['4', '5', '6']
            ]
        }
    },
    layout: { layoutId: 'fixture-layout', slots: [] },
    structure: { seoTitle: 'SEO title', seoDescription: 'SEO description' },
    relation: 'all-empty',
    relations: ['all-empty', 'unicode'],
    object: { label: { en: 'Label' }, value: 7, nested: { deep: 'deep value' } },
    list: [
        { name: 'first', count: 1 },
        { name: 'second', count: 2 }
    ],
    blocks: [
        { type: 'core/heading', data: { text: { en: 'Heading block' }, level: 'h2' } },
        { type: 'core/paragraph', data: { content: { en: 'Paragraph block.' } } },
        { type: 'core/image', data: { image: { art: 'landscape' }, caption: { en: 'Caption' } } },
        { type: 'core/quote', data: { text: { en: 'A quote.' }, author: { en: 'Someone' } } },
        { type: 'core/code', data: { code: 'const x = 1;', language: 'ts' } },
        { type: 'core/divider', data: {} },
        { type: 'core/spacer', data: { size: 'xl' } },
        { type: 'core/note', data: { text: 'An internal note.' } },
        { type: 'core/button', data: { link: { url: 'https://example.com', label: 'Button' } } },
        { type: 'core/embed', data: { url: 'https://example.com/embed', title: { en: 'Embed' } } },
        { type: 'core/gallery', data: { images: [{ art: 'landscape' }, { art: 'portrait' }] } },
        {
            type: 'core/table',
            data: { table: { value: { columnTitles: ['x', 'y'], rows: [['1', '2']] } } }
        },
        {
            type: 'core/video',
            data: { video: { provider: 'vimeo', target: '1' }, title: { en: 'Video block' } }
        },
        { type: 'core/audio', data: { src: '/audio/sample.mp3', title: { en: 'Audio block' } } },
        { type: 'core/form', data: { formId: 'everything', title: { en: 'Form block' } } },
        {
            type: 'core/hero',
            data: { title: { en: 'Hero block' }, backgroundImage: { art: 'landscape' } }
        }
    ]
};

const kitchen: SourceEntry[] = [
    { id: 'all-empty', data: { title: 'Only the required field' } },
    { id: 'all-filled', data: ALL_FILLED },
    {
        id: 'unicode',
        data: {
            title: STRINGS.emoji.slice(0, 60),
            text: { en: STRINGS.emoji, fr: STRINGS.combining, ar: STRINGS.rtl, ja: STRINGS.cjk },
            textarea: { en: [STRINGS.zeroWidth, STRINGS.whitespace, STRINGS.quotes].join('\n') },
            richText: { en: `${STRINGS.rtl}\n\n${STRINGS.cjk}\n\n${STRINGS.emoji}` },
            slug: { en: 'unicode', ja: 'ユニコード' },
            tags: ['émoji 🤖', 'العربية', '日本語', ''],
            email: 'josé@exämple.com',
            phone: '٠١٢٣٤٥٦٧٨٩'
        }
    },
    {
        id: 'injection',
        data: {
            title: '<b>Injection</b> & "quotes"',
            text: { en: STRINGS.injection },
            textarea: { en: STRINGS.markdownInPlain },
            richText: { en: STRINGS.injection },
            html: {
                html: {
                    en: '<script>alert(1)</script><iframe src="https://example.com"></iframe><p onclick="x()">click</p>'
                }
            },
            url: 'javascript:alert(1)',
            link: { url: 'javascript:alert(1)', label: '<img src=x onerror=alert(1)>' },
            json: { __proto__: { polluted: true }, constructor: { prototype: {} } },
            tags: ['<script>', '{{x}}']
        }
    },
    {
        id: 'max-lengths',
        data: {
            title: 'T'.repeat(120),
            text: { en: STRINGS.longWord },
            textarea: { en: LONG_PARAGRAPH.repeat(400) },
            tags: Array.from({ length: 200 }, (_, i) => `tag-${i}`),
            list: Array.from({ length: 300 }, (_, i) => ({ name: `Item ${i}`, count: i })),
            relations: Array.from({ length: 50 }, (_, i) => (i % 2 ? 'all-empty' : 'unicode')),
            json: { big: Array.from({ length: 2000 }, (_, i) => ({ i, v: `value ${i}` })) },
            blocks: Array.from({ length: 300 }, (_, i) =>
                i % 3 === 0
                    ? {
                          type: 'core/heading',
                          data: { text: { en: `Section ${i / 3 + 1}` }, level: 'h2' }
                      }
                    : {
                          type: 'core/paragraph',
                          data: { content: { en: `Paragraph ${i}. ${LONG_PARAGRAPH}` } }
                      }
            )
        }
    },
    {
        id: 'numbers',
        data: {
            title: 'Numbers',
            number: 0.1 + 0.2,
            order: -1,
            json: {
                max: Number.MAX_SAFE_INTEGER,
                min: Number.MIN_SAFE_INTEGER,
                tiny: 5e-324,
                big: 1e21,
                negZero: -0
            },
            list: [
                { name: 'zero', count: 0 },
                { name: 'negative', count: -273.15 },
                { name: 'huge', count: 1e21 }
            ]
        }
    },
    {
        id: 'dates',
        data: {
            title: 'Dates',
            date: '1900-01-01',
            datetime: '2099-12-31T23:59:59+14:00',
            time: '00:00',
            list: [
                { name: '1970-01-01T00:00:00Z', count: 0 },
                { name: '2038-01-19T03:14:08Z', count: 2147483648 }
            ]
        }
    },
    {
        id: 'cycle-a',
        data: { title: 'Cycle A', relation: 'cycle-b', relations: ['cycle-a', 'cycle-b'] }
    },
    { id: 'cycle-b', data: { title: 'Cycle B', relation: 'cycle-a' } },
    {
        id: 'broken-references',
        data: {
            title: 'Points at things that do not exist',
            relation: 'does-not-exist',
            relations: ['all-empty', 'gone-1', 'gone-2'],
            asset: { assetId: 'missing-asset-id' },
            assetList: [{ assetId: 'missing-asset-id' }, { art: 'deleted-file' }],
            categories: ['no-such-category'],
            layout: { layoutId: 'no-such-layout', slots: [] }
        }
    },
    {
        id: 'wrong-types',
        data: {
            title: 42,
            number: 'forty-two',
            boolean: 'yes',
            date: '29/02/2024',
            time: '25:61',
            color: 'reddish',
            email: 'not an email',
            select: 'delta',
            multiSelect: 'red',
            tags: 'one,two',
            list: { not: 'a list' },
            table: [['missing wrapper']]
        }
    },
    ...Array.from({ length: 6 }, (_, i) => ({
        id: `status-${['draft', 'published', 'unpublished', 'edited', 'scheduled-unpublish', 'draft-old'][i]}`,
        state: (
            ['draft', 'published', 'unpublished', 'edited', 'scheduled-unpublish', 'draft'] as const
        )[i],
        daysAgo: i === 5 ? 3650 : 10 - i,
        ...(i === 3 && { edits: [{ data: { title: 'Edited after publishing' } }] }),
        ...(i === 4 && { scheduleInDays: 400 }),
        data: {
            title: `Status: ${['draft', 'published', 'unpublished', 'edited', 'scheduled unpublish (in 400 days)', 'draft created ten years ago'][i]}`
        }
    }))
];

const requiredEverything: SourceEntry[] = [
    {
        id: 'complete',
        data: Object.fromEntries(
            Object.entries(ALL_FILLED).filter(
                ([k]) => !['id', 'blocks', 'relation', 'relations'].includes(k)
            )
        )
    },
    // A draft: drafts may leave required fields empty; review and publishing refuse it.
    {
        id: 'missing-everything',
        state: 'draft',
        data: { title: 'Every other required field is missing' }
    }
];

const wide: SourceEntry[] = Array.from({ length: 3 }, (_, n) => ({
    id: `wide-${n + 1}`,
    data: Object.fromEntries(
        Array.from({ length: 60 }, (_, i) => [
            `field${String(i + 1).padStart(2, '0')}`,
            i % 3 === 0 ? { en: `Value ${i + 1}` } : i % 3 === 1 ? i * (n + 1) : i % 2 === 0
        ]).filter((_, i) => n !== 2 || i % 4 === 0)
    )
}));

const localized: SourceEntry[] = [
    {
        id: 'all-locales',
        data: {
            title: { en: 'Hello', fr: 'Bonjour', ar: 'مرحبا', ja: 'こんにちは', 'fr-CA': 'Allô' },
            body: {
                en: 'English body.',
                fr: 'Corps français.',
                ar: STRINGS.rtl,
                ja: STRINGS.cjk,
                'fr-CA': 'Corps québécois.'
            },
            slug: { en: 'hello', fr: 'bonjour', ar: 'marhaba', ja: 'konnichiwa', 'fr-CA': 'allo' }
        }
    },
    {
        id: 'default-locale-only',
        data: { title: { en: 'Only English' }, body: { en: 'No translations yet.' } }
    },
    {
        id: 'missing-default-locale',
        data: { title: { fr: 'Seulement en français', ar: 'بالعربية فقط' } }
    },
    {
        id: 'region-only',
        data: { title: { en: 'Fallback test', 'fr-CA': 'Seulement fr-CA, pas fr' } }
    },
    { id: 'rtl-only', data: { title: { en: 'RTL', ar: STRINGS.rtl }, note: { ar: STRINGS.rtl } } },
    { id: 'empty-strings', data: { title: { en: 'Empty translations', fr: '', ar: '   ' } } }
];

const categories: SourceEntry[] = [
    { id: 'root', data: { name: 'Root' } },
    { id: 'child', data: { name: 'Child', parent: 'root' } },
    { id: 'grandchild', data: { name: 'Grandchild', parent: 'child' } },
    { id: 'orphan', data: { name: 'Orphan (parent missing)', parent: 'deleted-parent' } },
    { id: 'self-parent', data: { name: 'Its own parent', parent: 'self-parent' } }
];

/** Entries written straight to disk: formats core would never produce today. */
export const RAW_ENTRIES: Array<{ model: string; id: string; json: string }> = [
    {
        model: 'legacy',
        id: 'plain-string-rich-text',
        json: JSON.stringify({
            id: 'plain-string-rich-text',
            type: 'legacy',
            data: {
                title: { en: 'Rich text stored as plain strings' },
                body: { en: 'Plain text, not DAST.', fr: 'Texte brut.' }
            }
        })
    },
    {
        model: 'legacy',
        id: 'string-slug',
        json: JSON.stringify({
            id: 'string-slug',
            type: 'legacy',
            data: {
                title: { en: 'Multilingual slug stored as a string' },
                slug: 'one-slug-for-all'
            }
        })
    },
    {
        model: 'legacy',
        id: 'unknown-block',
        json: JSON.stringify({
            id: 'unknown-block',
            type: 'legacy',
            data: {
                title: { en: 'Unknown block type' },
                blocks: [
                    { type: 'old/carousel', data: { slides: 3 } },
                    { type: 'core/paragraph', data: { content: { en: 'not DAST' } } }
                ]
            }
        })
    },
    {
        model: 'legacy',
        id: 'extra-fields',
        json: JSON.stringify({
            id: 'extra-fields',
            type: 'legacy',
            status: 'archived',
            data: {
                title: { en: 'Fields the model no longer has' },
                removedField: 'still here',
                anotherOne: [1, 2, 3]
            }
        })
    },
    {
        model: 'legacy',
        id: 'id-mismatch',
        json: JSON.stringify({
            id: 'some-other-id',
            type: 'legacy',
            data: { title: { en: 'Folder name and id disagree' } }
        })
    },
    {
        model: 'legacy',
        id: 'broken-json',
        json: '{ "id": "broken-json", "type": "legacy", "data": { "title": '
    },
    { model: 'legacy', id: 'empty-file', json: '' },
    {
        model: 'legacy',
        id: 'no-data',
        json: JSON.stringify({ id: 'no-data', type: 'legacy' })
    }
];

/** Entries that must fail validation (anything else failing is a regression). */
export const EXPECTED_INVALID = [
    'all-required/missing-everything',
    'kitchen-sink/wrong-types',
    'kitchen-sink/injection',
    // A missing layout is detected; missing relations and assets are not (yet).
    'kitchen-sink/broken-references',
    // Slugs are ASCII only, so a Japanese slug is rejected.
    'kitchen-sink/unicode',
    'legacy/plain-string-rich-text',
    'legacy/string-slug',
    'legacy/unknown-block',
    'legacy/broken-json',
    'legacy/empty-file'
];

export function content(): Array<[string, SourceEntry[]]> {
    return [
        ['category', categories],
        ['kitchen-sink', kitchen],
        ['all-required', requiredEverything],
        ['wide', wide],
        ['single-field', [{ id: 'only', data: { name: 'The only entry' } }]],
        ['no-fields', [{ id: 'nothing', data: {} }]],
        ['localized', localized],
        [
            'note',
            Array.from({ length: 25 }, (_, i) => ({
                id: `note-${i + 1}`,
                data: { body: `User note ${i + 1}`, author: `user${i}@example.com` }
            }))
        ]
    ];
}
