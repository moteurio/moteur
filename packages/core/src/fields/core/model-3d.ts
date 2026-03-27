import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateModel3dField } from '../../validators/fields/core/validateModel3dField.js';

/**
 * 3D asset reference. Primary format is glTF/glb for web compatibility.
 * Locale-neutral field — only alt text is multilingual.
 */
fieldRegistry.register({
    type: 'core/model-3d',
    label: '3D Model',
    description: 'A 3D asset reference. Primary format is glTF/glb for web compatibility.',
    validate: validateModel3dField,
    fields: {
        src: {
            type: 'core/url',
            label: 'glTF/glb URL',
            description: 'URL to the 3D model file.',
            required: true
        },
        poster: {
            type: 'core/url',
            label: 'Fallback Image URL',
            description: 'Fallback image for preview or loading state.',
            required: false
        },
        alt: {
            type: 'core/text',
            label: 'Alt Text',
            description: 'Alternative text for accessibility.',
            multilingual: true,
            required: false
        },
        usdz: {
            type: 'core/url',
            label: 'USDZ URL (iOS AR)',
            description: 'USDZ format for iOS AR Quick Look.',
            required: false
        }
    },
    optionsSchema: {
        ui: {
            type: 'core/text',
            label: 'UI Hint',
            description:
                'Optional hint for Studio input rendering (e.g. "upload", "url"). Does not affect stored data.',
            required: false
        }
    }
});
