import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateHtmlStoredField } from '../../validators/fields/core/validateHtmlField.js';

/**
 * Raw HTML string. For legacy content and easy imports; no structure, stored as-is.
 */
fieldRegistry.register({
    type: 'core/html',
    label: 'HTML',
    description: 'Raw HTML string. For legacy purposes and easy imports; stored as-is.',
    validate: validateHtmlStoredField,
    storeDirect: true,
    fields: {
        html: {
            type: 'core/text',
            label: 'HTML Content',
            description: 'Raw HTML to store and render as-is.',
            multilingual: true,
            required: true
        }
    },
    optionsSchema: {
        allowedTags: {
            type: 'core/list',
            label: 'Allowed HTML Tags',
            description: 'Optional safe subset of tags; omit to allow stored HTML as-is.'
        },
        ui: {
            type: 'core/text',
            label: 'UI Hint',
            description: 'Optional hint for Studio input rendering.',
            required: false
        }
    }
});
