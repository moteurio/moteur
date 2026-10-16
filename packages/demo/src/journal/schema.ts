import type { ModelSchema } from '@moteurio/types/Model.js';
import type { BlockSchema } from '@moteurio/types/Block.js';
import type { TemplateSchema } from '@moteurio/types/Template.js';
import { f } from '../runtime/fields.js';

/**
 * Moteur Journal: the bilingual magazine of Moteur Industries S.A., a fictional robotics
 * company founded in a Montréal garage in 1968. Every core field type is used somewhere,
 * in a way an editor would recognise.
 */

const ml = { multilingual: true };
const req = { required: true };
const mlReq = { multilingual: true, required: true };

const seasons = [
    { value: 'hiver', label: 'Hiver / Winter' },
    { value: 'printemps', label: 'Printemps / Spring' },
    { value: 'ete', label: 'Été / Summer' },
    { value: 'automne', label: 'Automne / Autumn' }
];

const robotStatus = [
    { value: 'available', label: 'Available' },
    { value: 'waitlist', label: 'Waiting list' },
    { value: 'classified', label: 'Classified' },
    { value: 'discontinued', label: 'Discontinued' },
    { value: 'prototype', label: 'Prototype' }
];

const labelValue = f.object('Line', {
    label: f.text('Label', mlReq),
    value: f.text('Value', mlReq)
});

export const models: ModelSchema[] = [
    {
        id: 'article',
        label: 'Article',
        description:
            'Magazine articles. Each belongs to an issue, has an author and a body made of blocks.',
        modelType: 'content',
        fields: {
            title: f.text('Title', { ...mlReq, maxLength: 140 }),
            slug: f.slug('Slug', 'title', mlReq),
            excerpt: f.textarea('Excerpt', {
                ...ml,
                maxLength: 320,
                description: 'Shown in lists and previews.'
            }),
            cover: f.asset('Cover image'),
            author: f.relation('Author', 'author', req),
            contributors: f.relations('Contributors', 'author', { maxItems: 4 }),
            issue: f.relation('Issue', 'issue'),
            category: f.relation('Category', 'category', req),
            tags: f.tags('Tags', { maxTags: 8 }),
            publishedOn: f.date('Publication date (in the magazine)'),
            readingTime: f.number('Reading time (minutes)', { min: 1, max: 60 }),
            featured: f.boolean('Featured on the cover'),
            accent: f.color('Accent colour'),
            body: f.blocks('Body', req),
            related: f.relations('Related articles', 'article', { maxItems: 3 }),
            seo: f.structure('SEO', 'core/seo'),
            order: f.order('Order in issue')
        },
        // The article's form: the story first, the facts beside it. The accent colour is left
        // out on purpose, so the Studio shows it under "Not in the form".
        studio: {
            form: {
                sections: [
                    {
                        id: 'story',
                        kind: 'canvas',
                        fields: [
                            { field: 'title', as: 'headline' },
                            { field: 'excerpt', as: 'lede' },
                            { field: 'cover', as: 'hero' },
                            { field: 'body', as: 'document' }
                        ]
                    },
                    {
                        id: 'people',
                        kind: 'card',
                        place: 'side',
                        label: { fr: 'Signatures', en: 'People' },
                        fields: ['author', 'contributors']
                    },
                    {
                        id: 'print',
                        kind: 'card',
                        place: 'side',
                        label: { fr: 'Dans le numéro', en: 'In print' },
                        rows: [
                            ['issue'],
                            ['category'],
                            ['publishedOn', { field: 'readingTime', as: 'big' }],
                            ['featured']
                        ]
                    },
                    {
                        id: 'web',
                        kind: 'drawer',
                        place: 'side',
                        label: { fr: 'Pour le web', en: 'For the web' },
                        fields: ['slug', 'tags', 'related', 'seo', 'order']
                    }
                ]
            }
        }
    },
    {
        id: 'author',
        label: 'Author',
        description: 'Journalists, staff and the occasional robot who write for the Journal.',
        modelType: 'content',
        fields: {
            name: f.text('Name', req),
            slug: f.slug('Slug', 'name', req),
            role: f.text('Role', ml),
            kind: f.select(
                'Kind',
                [
                    { value: 'human', label: 'Human' },
                    { value: 'robot', label: 'Robot' }
                ],
                req
            ),
            bio: f.richText('Biography', ml),
            portrait: f.asset('Portrait'),
            email: f.email('Email'),
            joined: f.date('Joined the Journal'),
            languages: f.multiSelect('Writes in', [
                { value: 'fr', label: 'Français' },
                { value: 'en', label: 'English' },
                { value: 'es', label: 'Español' },
                { value: 'binary', label: 'Binary' }
            ]),
            website: f.link('Website'),
            social: f.list(
                'Elsewhere',
                f.object('Profile', {
                    network: f.select('Network', ['radio', 'telex', 'newsletter', 'website'], req),
                    handle: f.text('Handle', req)
                })
            )
        }
    },
    {
        id: 'issue',
        label: 'Issue',
        description: 'One print issue of the Journal, 1968–1978, plus the issue in preparation.',
        modelType: 'content',
        fields: {
            number: f.number('Number', { ...req, min: 0 }),
            name: f.text('Name', mlReq),
            slug: f.slug('Slug', 'name', mlReq),
            theme: f.text('Theme', ml),
            season: f.select('Season', seasons),
            year: f.number('Year', { min: 1968, max: 1999 }),
            publishedOn: f.date('On newsstands'),
            intro: f.richText('Editor’s letter', ml),
            cover: f.asset('Cover'),
            printEdition: f.asset('Print edition (PDF)'),
            price: f.number('Cover price (CAD)', { min: 0, step: 0.05 }),
            featured: f.relations('Featured articles', 'article', { maxItems: 3 }),
            order: f.order()
        }
    },
    {
        id: 'series',
        label: 'Series',
        description: 'Product lines of Moteur Industries.',
        modelType: 'content',
        fields: {
            number: f.text('Series number', req),
            name: f.text('Name', req),
            slug: f.slug('Slug', 'name', req),
            tagline: f.text('Tagline', ml),
            description: f.richText('Description', ml),
            years: f.text('Years in production'),
            color: f.color('Series colour'),
            hero: f.asset('Hero image'),
            body: f.blocks('Story'),
            order: f.order()
        }
    },
    {
        id: 'robot',
        label: 'Robot',
        description: 'Individual models in the Moteur catalogue.',
        modelType: 'content',
        fields: {
            name: f.text('Model name', req),
            slug: f.slug('Slug', 'name', req),
            serial: f.id('Catalogue ID'),
            series: f.relation('Series', 'series', req),
            tagline: f.text('Tagline', ml),
            description: f.richText('Description', ml),
            status: f.select('Availability', robotStatus, req),
            releaseYear: f.number('Release year', { min: 1968, max: 1999 }),
            price: f.number('Price (CAD)', { min: 0 }),
            colorway: f.color('Colourway'),
            icon: f.icon('Catalogue icon'),
            image: f.asset('Portrait'),
            gallery: f.assetList('Gallery', { maxItems: 8 }),
            specs: f.list('Specifications', labelValue),
            measurements: f.table('Measurements', { maxCols: 4 }),
            manual: f.markdown('Owner’s manual (excerpt)', ml),
            telemetry: f.json('Default telemetry profile'),
            film: f.video('Promotional film'),
            baseLocation: f.geoLocation('Assembly plant'),
            order: f.order()
        }
    },
    {
        id: 'category',
        label: 'Category',
        description: 'Editorial sections of the Journal.',
        modelType: 'taxonomy',
        fields: {
            name: f.text('Name', mlReq),
            slug: f.slug('Slug', 'name', mlReq),
            description: f.textarea('Description', ml),
            color: f.color('Colour'),
            icon: f.icon('Icon'),
            order: f.order()
        }
    },
    {
        id: 'event',
        label: 'Event',
        description: 'Exhibitions, open houses, talks and launches.',
        modelType: 'content',
        fields: {
            title: f.text('Title', mlReq),
            slug: f.slug('Slug', 'title', mlReq),
            kind: f.select(
                'Kind',
                [
                    { value: 'exhibition', label: 'Exhibition' },
                    { value: 'talk', label: 'Talk' },
                    { value: 'open-house', label: 'Open house' },
                    { value: 'launch', label: 'Launch' },
                    { value: 'workshop', label: 'Workshop' }
                ],
                req
            ),
            startsAt: f.datetime('Starts', req),
            endsAt: f.datetime('Ends'),
            doorsOpen: f.time('Doors open'),
            venue: f.text('Venue', req),
            address: f.address('Address'),
            location: f.geoLocation('Map location'),
            price: f.number('Ticket price (CAD)', { min: 0 }),
            soldOut: f.boolean('Sold out'),
            tickets: f.url('Tickets'),
            contactEmail: f.email('Contact email'),
            contactPhone: f.phone('Contact phone'),
            poster: f.asset('Poster'),
            description: f.richText('Description', ml),
            tags: f.tags('Tags')
        },
        // Events read like a ticket: when and where up front; price and tickets only for the
        // kinds of event that charge.
        studio: {
            form: {
                sections: [
                    {
                        id: 'story',
                        kind: 'canvas',
                        fields: [
                            { field: 'title', as: 'headline' },
                            { field: 'poster', as: 'hero' },
                            { field: 'description', as: 'document' }
                        ]
                    },
                    {
                        id: 'where',
                        kind: 'sheet',
                        label: { fr: 'Où', en: 'Where' },
                        fields: ['venue', 'address', 'location']
                    },
                    {
                        id: 'when',
                        kind: 'card',
                        place: 'side',
                        label: { fr: 'Quand', en: 'When' },
                        rows: [[{ field: 'startsAt', as: 'ticket' }], ['endsAt'], ['doorsOpen']]
                    },
                    {
                        id: 'tickets',
                        kind: 'card',
                        place: 'side',
                        label: { fr: 'Entrée', en: 'Admission' },
                        fields: [
                            { field: 'kind', as: 'segments' },
                            {
                                field: 'price',
                                as: 'big',
                                when: { kind: ['talk', 'launch', 'workshop'] }
                            },
                            'soldOut',
                            { field: 'tickets', when: { kind: ['talk', 'launch', 'workshop'] } }
                        ]
                    },
                    {
                        id: 'more',
                        kind: 'drawer',
                        place: 'side',
                        label: { fr: 'Contact et web', en: 'Contact and web' },
                        fields: ['contactEmail', 'contactPhone', 'slug', 'tags']
                    }
                ]
            }
        }
    },
    {
        id: 'press-release',
        label: 'Press release',
        description: 'Official statements from Moteur Industries.',
        modelType: 'content',
        fields: {
            title: f.text('Title', mlReq),
            slug: f.slug('Slug', 'title', mlReq),
            date: f.date('Date', req),
            summary: f.textarea('Summary', ml),
            body: f.markdown('Body', mlReq),
            attachments: f.assetList('Attachments'),
            contact: f.email('Press contact')
        }
    },
    {
        id: 'job',
        label: 'Job opening',
        description: 'Careers at Moteur Industries and the Journal.',
        modelType: 'content',
        fields: {
            title: f.text('Title', mlReq),
            slug: f.slug('Slug', 'title', mlReq),
            department: f.select(
                'Department',
                [
                    { value: 'editorial', label: 'Editorial' },
                    { value: 'engineering', label: 'Engineering' },
                    { value: 'factory', label: 'Factory' },
                    { value: 'expeditions', label: 'Expeditions' },
                    { value: 'customer-care', label: 'Customer care' }
                ],
                req
            ),
            employment: f.select(
                'Employment',
                [
                    { value: 'full-time', label: 'Full time' },
                    { value: 'part-time', label: 'Part time' },
                    { value: 'contract', label: 'Contract' }
                ],
                req
            ),
            location: f.address('Location'),
            remote: f.boolean('Remote possible'),
            salaryMin: f.number('Salary from (CAD/year)', { min: 0 }),
            salaryMax: f.number('Salary to (CAD/year)', { min: 0 }),
            closesOn: f.date('Applications close'),
            description: f.richText('Description', mlReq),
            apply: f.link('Apply', req)
        }
    },
    {
        id: 'faq',
        label: 'FAQ',
        description: 'Questions readers and customers ask.',
        modelType: 'content',
        fields: {
            question: f.text('Question', mlReq),
            answer: f.richText('Answer', mlReq),
            topics: f.categories('Topics', 'category'),
            order: f.order()
        }
    },
    {
        id: 'settings',
        label: 'Site settings',
        description: 'One entry: identity, contact details and site-wide options.',
        modelType: 'settings',
        fields: {
            siteName: f.text('Site name', req),
            tagline: f.text('Tagline', ml),
            logo: f.asset('Logo'),
            primaryColor: f.color('Primary colour'),
            contactEmail: f.email('Contact email', req),
            phone: f.phone('Switchboard'),
            address: f.address('Head office'),
            openingHours: f.list(
                'Opening hours',
                f.object('Hours', {
                    days: f.text('Days', mlReq),
                    opens: f.time('Opens'),
                    closes: f.time('Closes')
                })
            ),
            social: f.list('Social links', f.link('Link')),
            announcement: f.object('Announcement bar', {
                enabled: f.boolean('Show'),
                message: f.text('Message', ml),
                link: f.link('Link')
            }),
            footer: f.html('Footer note', ml),
            homeLayout: f.layout('Home page layout'),
            defaultSeo: f.structure('Default SEO', 'core/seo'),
            analytics: f.json('Analytics configuration'),
            workflowStatus: f.status('Site status'),
            maintenance: f.boolean('Maintenance mode')
        }
    }
];

const listOf = (label: string, fields: Parameters<typeof f.object>[1], o = {}) =>
    f.list(label, f.object(label, fields), o);

/** Blocks specific to the Journal (core blocks are added by core). */
export const blocks: BlockSchema[] = [
    {
        type: 'demo/teletype',
        label: 'Teletype',
        description: 'A dateline typed out character by character, like a wire dispatch.',
        category: 'editorial',
        fields: { text: f.text('Text', mlReq) }
    },
    {
        type: 'demo/pull-quote',
        label: 'Pull quote',
        description: 'A large quotation lifted from the article.',
        category: 'editorial',
        fields: { text: f.richText('Text', mlReq), attribution: f.text('Attribution', ml) }
    },
    {
        type: 'demo/data-callout',
        label: 'Data callout',
        description: 'One big number with a label.',
        category: 'editorial',
        fields: { number: f.text('Number', req), label: f.text('Label', mlReq) }
    },
    {
        type: 'demo/timeline',
        label: 'Timeline',
        description: 'A chronological sequence of events.',
        category: 'editorial',
        fields: {
            events: listOf(
                'Events',
                { year: f.text('Year', req), event: f.richText('Event', mlReq) },
                { minItems: 2 }
            )
        }
    },
    {
        type: 'demo/dialogue',
        label: 'Dialogue',
        description: 'A transcript between two speakers, typically a human and a robot.',
        category: 'editorial',
        fields: {
            exchanges: listOf(
                'Exchanges',
                {
                    speaker: f.select('Speaker', ['human', 'robot'], req),
                    speaker_name: f.text('Speaker name'),
                    text: f.richText('Text', mlReq)
                },
                { minItems: 2 }
            )
        }
    },
    {
        type: 'demo/spec-card',
        label: 'Spec card',
        description: 'A robot specification sheet with a status badge.',
        category: 'editorial',
        fields: {
            model_name: f.text('Model name', req),
            series: f.text('Series'),
            status: f.select(
                'Status',
                robotStatus.map(s => s.value),
                req
            ),
            specs: f.list('Specifications', labelValue)
        }
    },
    {
        type: 'demo/warning',
        label: 'Editor’s note',
        description: 'A boxed note from the editors.',
        category: 'editorial',
        fields: { text: f.richText('Text', mlReq), code: f.text('Label') }
    },
    {
        type: 'demo/classified',
        label: 'Classified',
        description: 'A redacted, stamped document.',
        category: 'editorial',
        fields: {
            title: f.text('Title', ml),
            content: f.richText('Content', mlReq),
            classification: f.text('Classification')
        }
    },
    {
        type: 'demo/illustration-brief',
        label: 'Illustration brief',
        description: 'A placeholder describing an illustration still to be commissioned.',
        category: 'media',
        fields: {
            description: f.richText('Description', mlReq),
            style: f.text('Style'),
            placeholder_color: f.color('Placeholder colour')
        }
    },
    {
        type: 'demo/kinetic-text',
        label: 'Kinetic text',
        description: 'Animated display text.',
        category: 'interactive',
        fields: {
            text: f.text('Text', mlReq),
            animation: f.select('Animation', ['words', 'letters', 'lines'])
        }
    },
    {
        type: 'demo/ad',
        label: 'House ad',
        description: 'A promotional unit for Moteur Industries products.',
        category: 'editorial',
        fields: {
            eyebrow: f.text('Eyebrow', ml),
            headline: f.text('Headline', mlReq),
            body: f.richText('Body', ml),
            cta_label: f.text('Button label', ml),
            cta_url: f.url('Button URL')
        }
    },
    {
        type: 'demo/3d-scene',
        label: '3D scene',
        description: 'A rotating 3D model of a robot.',
        category: 'media',
        fields: {
            model: f.model3d('3D model', req),
            environment: f.select('Environment', ['studio', 'outdoor', 'dark', 'underwater']),
            interaction: f.select('Interaction', ['orbit', 'auto-rotate', 'scroll-scrub', 'none']),
            caption: f.text('Caption', ml)
        }
    },
    {
        type: 'demo/signal-map',
        label: 'Signal map',
        description: 'Coordinates and readings from an expedition.',
        category: 'data',
        fields: {
            latitude: f.number('Latitude', { min: -90, max: 90 }),
            longitude: f.number('Longitude', { min: -180, max: 180 }),
            depth: f.text('Depth'),
            temperature: f.text('Temperature'),
            signal_strength: f.text('Signal strength'),
            label: f.text('Label', ml)
        }
    },
    {
        type: 'demo/transmission',
        label: 'Transmission',
        description: 'A radio message, with source, frequency and time.',
        category: 'editorial',
        fields: {
            source: f.text('Source'),
            frequency: f.text('Frequency'),
            timestamp: f.text('Timestamp'),
            body: f.text('Message', mlReq)
        }
    },
    {
        type: 'demo/atmosphere',
        label: 'Atmosphere',
        description: 'A visual effect for pacing: fog, static, grain, void. No text.',
        category: 'interactive',
        fields: {
            mood: f.select('Mood', ['fog', 'static', 'grain', 'void', 'snow'], req),
            duration: f.number('Duration (seconds)', { min: 0 }),
            intensity: f.select('Intensity', ['subtle', 'medium', 'strong'])
        }
    },
    {
        type: 'demo/audio-cue',
        label: 'Audio cue',
        description: 'Ambient sound played when the block scrolls into view.',
        category: 'interactive',
        fields: {
            src: f.url('Audio URL', req),
            trigger: f.select('Trigger', ['enter', 'scroll', 'click']),
            behavior: f.select('Behaviour', ['loop', 'once', 'fade-loop', 'fade-once']),
            volume: f.number('Volume', { min: 0, max: 1 }),
            label: f.text('Label (Studio only)')
        }
    },
    {
        type: 'demo/scroll-marker',
        label: 'Scroll marker',
        description: 'An invisible trigger that fires a named event in the reader’s browser.',
        category: 'interactive',
        fields: {
            event: f.text('Event name', req),
            offset: f.select('Offset', ['top', 'center', 'bottom'])
        }
    }
];

export const templates: Array<Omit<TemplateSchema, 'createdAt' | 'updatedAt' | 'projectId'>> = [
    {
        id: 'home',
        label: 'Home',
        description: 'Front page: hero, latest issue, featured articles.',
        fields: {
            heroTitle: f.text('Hero title', mlReq),
            heroText: f.richText('Hero text', ml),
            heroImage: f.asset('Hero image'),
            sections: f.blocks('Sections')
        }
    },
    {
        id: 'journal',
        label: 'Journal',
        description: 'Issue and article listings.',
        fields: {
            intro: f.richText('Introduction', ml),
            perPage: f.number('Articles per page', { min: 3, max: 48 })
        }
    },
    {
        id: 'basic',
        label: 'Basic page',
        description: 'A title and a body made of blocks.',
        fields: {
            title: f.text('Title', mlReq),
            lede: f.textarea('Lede', ml),
            body: f.blocks('Body'),
            seo: f.structure('SEO', 'core/seo')
        }
    },
    {
        id: 'listing',
        label: 'Listing',
        description: 'A collection page for one model (robots, events, jobs…).',
        fields: { title: f.text('Title', mlReq), intro: f.richText('Introduction', ml) }
    },
    {
        id: 'contact',
        label: 'Contact',
        description: 'Contact details and a form.',
        fields: {
            title: f.text('Title', mlReq),
            intro: f.richText('Introduction', ml),
            formId: f.text('Form', req)
        }
    }
];
