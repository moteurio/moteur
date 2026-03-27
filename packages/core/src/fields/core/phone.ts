import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateTextField } from '../../validators/fields/core/validateTextField.js';

/**
 * Phone field. Explicitly NO format validation — phone formats vary globally
 * (E.164, national formats, extensions, etc.). Store as plain string.
 */
fieldRegistry.register({
    type: 'core/phone',
    label: 'Phone',
    description: 'A phone number string. No format enforcement — phone formats vary globally.',
    storeDirect: true,
    validate: validateTextField,
    fields: {
        value: {
            type: 'core/text',
            label: 'Phone',
            description: 'The phone number.',
            required: true
        }
    },
    optionsSchema: {
        placeholder: {
            type: 'core/text',
            label: 'Placeholder',
            description: 'Placeholder text for the phone field.',
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
