import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateMediaImageField } from '../../validators/fields/core/validateMediaImageField.js';

fieldRegistry.register({
    type: 'core/media-image',
    label: 'Image File',
    description: 'A single image file URL or path.',
    storeDirect: true,
    validate: validateMediaImageField,
    fields: {
        src: {
            type: 'core/text',
            label: 'Image Source',
            required: true
        }
    },
    optionsSchema: {
        allowedExtensions: {
            type: 'core/list',
            default: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'svg', 'svgz'],
            description: 'Allowed image file extensions.'
        },
        maxSize: {
            type: 'core/number',
            description: 'Maximum file size (in bytes) for the image.'
        },
        maxWidth: {
            type: 'core/number',
            description: 'Maximum width (in pixels) for the image.'
        },
        maxHeight: {
            type: 'core/number',
            description: 'Maximum height (in pixels) for the image.'
        },
        ui: {
            type: 'core/text',
            label: 'UI Hint',
            description: 'Optional hint for Studio input rendering. Does not affect stored data.',
            required: false
        }
    }
});
