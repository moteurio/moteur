import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateImageField } from '../../validators/fields/core/validateImageField.js';

fieldRegistry.register({
    type: 'core/image',
    label: 'Image',
    description: 'An image field with alt text, caption, and optional credit.',
    validate: validateImageField,
    resolveValue: false,
    fields: {
        src: {
            type: 'core/media-image',
            label: 'Image Source',
            description: 'The source URL or ID of the image.',
            required: true
        },
        alt: {
            type: 'core/text',
            label: 'Alt Text',
            description: 'Alternative text for the image, used for accessibility.',
            multilingual: true
        },
        caption: {
            type: 'core/text',
            multilingual: true,
            label: 'Caption',
            description: 'An optional caption for the image.'
        },
        credit: {
            type: 'core/text',
            multilingual: true,
            label: 'Credit',
            description: 'An optional credit for the image source.'
        },
        ariaLabel: {
            type: 'core/text',
            multilingual: true,
            label: 'ARIA Label',
            description: 'ARIA label for screen readers, used if alt is insufficient or empty.'
        },
        role: {
            type: 'core/select',
            default: 'img',
            options: ['presentation', 'img', 'none'],
            label: 'ARIA Role',
            description: 'ARIA role for the image element.'
        }
    },
    optionsSchema: {
        aspectRatio: {
            type: 'core/select',
            default: 'auto',
            options: ['auto', '1:1', '16:9', '4:3', '3:2'],
            description: 'Enforce a specific aspect ratio for the image.'
        },
        responsive: {
            type: 'core/boolean',
            default: true,
            description: 'Allow the image to scale responsively.'
        },
        loading: {
            type: 'core/select',
            default: 'lazy',
            options: ['lazy', 'eager', 'auto'],
            description: 'Set native HTML loading behavior for the image.'
        },
        focalPoint: {
            type: 'core/text',
            default: 'center',
            description: "CSS object-position value for the image focal point (e.g., 'center top')."
        },
        objectFit: {
            type: 'core/select',
            default: 'cover',
            options: ['cover', 'contain', 'fill', 'none', 'scale-down'],
            description: 'Defines how the image should be resized to fit its container.'
        },
        allowUpload: {
            type: 'core/boolean',
            default: false,
            description: 'Allow direct image upload instead of just URLs.'
        },
        decorative: {
            type: 'core/boolean',
            default: false,
            description: 'Mark the image as decorative, hiding it from screen readers.'
        },
        ui: {
            type: 'core/text',
            label: 'UI Hint',
            description: 'Optional hint for Studio input rendering. Does not affect stored data.',
            required: false
        }
    }
});
