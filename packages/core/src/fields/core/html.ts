import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateHtmlStoredField } from '../../validators/fields/core/validateHtmlField.js';

/**
 * Raw HTML string. For legacy content and easy imports; no structure, stored as-is.
 */
fieldRegistry.register({
    type: 'core/html',
    label: 'HTML',
    description:
        'Raw HTML, stored as it is. For embeds and imported HTML that must stay as written.',
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
            description: 'The tags allowed. Left out, stored HTML is kept as it is.'
        },
        ui: {
            type: 'core/text',
            label: 'UI Hint',
            description: 'Optional hint for Studio input rendering.',
            required: false
        }
    }
});
