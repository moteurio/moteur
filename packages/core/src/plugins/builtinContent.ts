/**
 * Built-in block and structure schemas. They ship with the engine, so a fresh data directory
 * still has paragraph, hero, SEO, and the rest. A file under data/core overrides one of these.
 */
import type { BlockSchema } from '@moteurio/types/Block.js';
import type { StructureSchema } from '@moteurio/types/Structure.js';

const text = (label: string, extra: Record<string, unknown> = {}) =>
    ({ type: 'core/text', label, ...extra }) as BlockSchema['fields'][string];
const rich = (label: string, extra: Record<string, unknown> = {}) =>
    ({
        type: 'core/rich-text',
        label,
        multilingual: true,
        ...extra
    }) as BlockSchema['fields'][string];

export const builtinBlockSchemas: BlockSchema[] = [
    {
        type: 'core/paragraph',
        label: 'Paragraph',
        description: 'A rich text paragraph.',
        category: 'content',
        fields: { content: rich('Content', { required: true }) }
    },
    {
        type: 'core/heading',
        label: 'Heading',
        description: 'A semantic heading. Level controls h1–h6.',
        category: 'content',
        variantHints: ['display', 'section', 'label'],
        fields: {
            text: text('Heading', { multilingual: true, required: true }),
            level: {
                type: 'core/select',
                label: 'Level',
                options: { choices: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] },
                default: 'h2'
            }
        }
    },
    {
        type: 'core/image',
        label: 'Image',
        description: 'A single image.',
        category: 'media',
        fields: {
            image: { type: 'core/image', label: 'Image', required: true },
            title: text('Title', { multilingual: true }),
            caption: text('Caption', { multilingual: true }),
            credit: text('Credit', { multilingual: true })
        }
    },
    {
        type: 'core/gallery',
        label: 'Gallery',
        description: 'A row of images.',
        category: 'media',
        fields: {
            images: { type: 'core/asset-list', label: 'Images', required: true },
            caption: text('Caption', { multilingual: true })
        }
    },
    {
        type: 'core/hero',
        label: 'Hero',
        description: 'A page banner with a title and a background image.',
        category: 'content',
        fields: {
            title: text('Title', { multilingual: true, required: true }),
            subtitle: text('Subtitle', { multilingual: true }),
            backgroundImage: { type: 'core/image', label: 'Background' },
            alignment: {
                type: 'core/select',
                label: 'Alignment',
                options: { choices: ['left', 'center', 'right'] },
                default: 'left'
            },
            headingLevel: {
                type: 'core/select',
                label: 'Heading level',
                options: { choices: ['h1', 'h2', 'h3'] },
                default: 'h1'
            }
        }
    },
    {
        type: 'core/quote',
        label: 'Quote',
        description: 'A quotation with an optional author.',
        category: 'content',
        fields: {
            text: rich('Quote', { required: true }),
            author: text('Author', { multilingual: true }),
            attribution: text('Attribution', { multilingual: true })
        }
    },
    {
        type: 'core/spacer',
        label: 'Spacer',
        description: 'Vertical space.',
        category: 'layout',
        fields: {
            size: {
                type: 'core/select',
                label: 'Size',
                options: { choices: ['xs', 'sm', 'md', 'lg', 'xl'] },
                default: 'md'
            },
            custom: { type: 'core/number', label: 'Custom height (px)' }
        }
    },
    {
        type: 'core/divider',
        label: 'Divider',
        description: 'A horizontal rule.',
        category: 'layout',
        fields: {}
    },
    {
        type: 'core/button',
        label: 'Button',
        description: 'A link shown as a button.',
        category: 'content',
        fields: {
            link: { type: 'core/link', label: 'Link', required: true },
            label: text('Label', { multilingual: true }),
            url: { type: 'core/url', label: 'URL' }
        }
    },
    {
        type: 'core/code',
        label: 'Code',
        description: 'A code listing.',
        category: 'content',
        fields: {
            code: { type: 'core/textarea', label: 'Code', required: true },
            language: text('Language'),
            filename: text('Filename')
        }
    },
    {
        type: 'core/note',
        label: 'Note',
        description: 'An editorial note. Not part of the public content.',
        category: 'content',
        editorial: true,
        fields: { text: text('Note', { required: true }) }
    },
    {
        type: 'core/embed',
        label: 'Embed',
        description: 'An embedded page.',
        category: 'media',
        fields: {
            url: { type: 'core/url', label: 'URL', required: true },
            title: text('Title', { multilingual: true })
        }
    },
    {
        type: 'core/table',
        label: 'Table',
        category: 'content',
        fields: {
            table: { type: 'core/table', label: 'Table', required: true },
            caption: text('Caption', { multilingual: true })
        }
    },
    {
        type: 'core/video',
        label: 'Video',
        category: 'media',
        fields: {
            video: { type: 'core/video', label: 'Video', required: true },
            title: text('Title', { multilingual: true }),
            description: text('Description', { multilingual: true })
        }
    },
    {
        type: 'core/audio',
        label: 'Audio',
        category: 'media',
        fields: {
            src: { type: 'core/url', label: 'File', required: true },
            title: text('Title', { multilingual: true }),
            transcript: rich('Transcript')
        }
    },
    {
        type: 'core/form',
        label: 'Form',
        category: 'content',
        fields: {
            formId: text('Form', { required: true }),
            title: text('Title', { multilingual: true }),
            successMessage: text('Success message', { multilingual: true })
        }
    }
];

const structureField = (type: string, label: string, extra: Record<string, unknown> = {}) =>
    ({ type, label, ...extra }) as StructureSchema['fields'][string];

/** The four structures that used to live in data/core/structures. */
export const builtinStructureSchemas: StructureSchema[] = [
    {
        type: 'core/audit',
        label: 'Audit',
        description: 'Information about who created or updated the content and when.',
        fields: {
            createdBy: structureField('core/text', 'Created by', {
                description: 'Name or ID of the user who created this entry.',
                options: { multilingual: false }
            }),
            updatedBy: structureField('core/text', 'Updated by', {
                description: 'Name or ID of the user who last updated this entry.',
                options: { multilingual: false }
            }),
            createdAt: structureField('core/datetime', 'Created at', {
                description: 'Date/time when the entry was created.',
                options: { multilingual: false }
            }),
            updatedAt: structureField('core/datetime', 'Updated at', {
                description: 'Date/time when the entry was last updated.',
                options: { multilingual: false }
            }),
            revision: structureField('core/number', 'Revision', {
                description: 'Revision number of the entry.',
                options: { multilingual: false }
            }),
            publishedRevision: structureField('core/number', 'Published revision', {
                description:
                    'Revision number at the time of last publish. Absent when never published.',
                options: { multilingual: false }
            }),
            publishedCommit: structureField('core/text', 'Published commit', {
                description:
                    'Git commit hash of the published version. Used by public API to serve frozen content via git show.',
                options: { multilingual: false }
            }),
            publishedAt: structureField('core/datetime', 'Published at', {
                description: 'Date/time when the entry was last published.',
                options: { multilingual: false }
            })
        }
    },
    {
        type: 'core/publishable',
        label: 'Publishable',
        description: 'Fields that control publishing status and slugs.',
        fields: {
            status: structureField('core/select', 'Status', {
                description: 'Current publication status.',
                options: {
                    choices: [
                        { value: 'draft', label: 'Draft' },
                        { value: 'published', label: 'Published' },
                        { value: 'archived', label: 'Archived' }
                    ],
                    allowEmpty: false
                }
            }),
            slug: structureField('core/text', 'Slug', {
                description: 'URL-friendly identifier for the entry.',
                options: { multilingual: false }
            }),
            publishDate: structureField('core/text', 'Publish Date', {
                description: 'Date when the entry should be published.',
                options: { multilingual: false }
            })
        }
    },
    {
        type: 'core/seo',
        label: 'SEO',
        description: 'Search engine optimization fields.',
        fields: {
            seoTitle: structureField('core/text', 'SEO Title', {
                description: 'Custom title for search engines.',
                options: { multilingual: true }
            }),
            seoDescription: structureField('core/text', 'SEO Description', {
                description: 'Custom meta description for search engines.',
                options: { multilingual: true, ui: 'textarea' }
            }),
            seoImage: structureField('core/image', 'SEO Image', {
                description: 'Image used for social sharing (e.g., Open Graph).'
            }),
            canonicalUrl: structureField('core/url', 'Canonical URL', {
                description: 'Preferred URL for this content.'
            })
        }
    },
    {
        type: 'core/source',
        label: 'Source',
        description:
            'A source structure defines a data source for a model, including its type, query parameters, and field mappings.',
        fields: {
            source: structureField('core/text', 'Source ID', {
                description: "The ID of the source model (e.g., 'project/source').",
                required: true
            }),
            type: structureField('core/text', 'Source Type', {
                description: "The type of source, such as 'json', 'csv', or 'api'.",
                required: true,
                default: 'json'
            }),
            readonly: structureField('core/boolean', 'Read-Only', {
                description: 'If true, the source data cannot be modified.',
                default: false
            }),
            query: structureField('core/object', 'Query Parameters', {
                description: 'Optional query parameters to filter or sort the source data.',
                required: false
            }),
            filters: structureField('core/object', 'Filters', {
                description: 'Optional filters to apply to the source data.',
                required: false
            }),
            mappings: structureField('core/object', 'Field Mappings', {
                description: 'Mappings for fields in the source model to the current model.',
                required: false
            })
        }
    }
];
