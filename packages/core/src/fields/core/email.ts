import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateEmailField } from '../../validators/fields/core/validateEmailField.js';

/**
 * Email field. Validated against standard email format on save.
 */
fieldRegistry.register({
    type: 'core/email',
    label: 'Email',
    description: 'An email address. Validated against standard email format.',
    storeDirect: true,
    validate: validateEmailField,
    fields: {
        value: {
            type: 'core/text',
            label: 'Email',
            description: 'The email address.',
            required: true
        }
    },
    optionsSchema: {
        placeholder: {
            type: 'core/text',
            label: 'Placeholder',
            description: 'Placeholder text for the email field.',
            required: false
        },
        allowEmpty: {
            type: 'core/boolean',
            default: false,
            label: 'Allow Empty',
            description: 'Whether the field can be empty.'
        },
        ui: {
            type: 'core/text',
            label: 'UI Hint',
            description: 'Optional hint for Studio input rendering. Does not affect stored data.',
            required: false
        }
    }
});
