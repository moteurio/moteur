import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateVideoField } from '../../validators/fields/core/validateVideoField.js';

fieldRegistry.register({
    type: 'core/video',
    label: 'Video',
    description: 'A video field.',
    validate: validateVideoField,
    fields: {
        provider: {
            type: 'string',
            label: 'Provider',
            description: 'The video provider (e.g., YouTube, Vimeo).',
            multilingual: true,
            required: true
        },
        target: {
            type: 'string',
            label: 'Video ID',
            description: 'The unique identifier for the video on the provider.',
            multilingual: true,
            required: true
        },
        title: {
            type: 'string',
            multilingual: true,
            label: 'Title',
            description: 'A title for accessibility and SEO.'
        },
        caption: {
            type: 'string',
            multilingual: true,
            label: 'Caption',
            description: 'Optional caption displayed below the video.'
        }
    },
    optionsSchema: {
        autoplay: {
            type: 'boolean',
            default: false,
            label: 'Autoplay'
        },
        loop: {
            type: 'boolean',
            default: false,
            label: 'Loop'
        },
        muted: {
            type: 'boolean',
            default: false,
            label: 'Muted'
        },
        controls: {
            type: 'boolean',
            default: true,
            label: 'Show Controls'
        },
        ui: {
            type: 'core/text',
            label: 'UI Hint',
            description: 'Optional hint for Studio input rendering. Does not affect stored data.',
            required: false
        }
    }
});
