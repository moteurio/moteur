import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateTextField } from '../../validators/fields/core/validateTextField.js';

fieldRegistry.register({
    type: 'core/text',
    label: 'Text',
    description: 'A single-line string field with multilingual support.',
    validate: validateTextField,
    storeDirect: true,
    fields: {
        text: {
            type: 'string',
            label: 'Text',
            description: 'The text value of the field.',
            required: true,
            multilingual: true
        }
    },
    optionsSchema: {
        maxLength: {
            type: 'core/number',
            default: 255,
            label: 'Max Length',
            description: 'Maximum length of the text field.'
        },
        minLength: {
            type: 'core/number',
            default: 1,
            label: 'Min Length',
            description: 'Minimum length of the text field.'
        },
        allowEmpty: {
            type: 'core/boolean',
            default: false,
            label: 'Allow Empty',
            description: 'Whether the field can be empty.'
        },
        validation: {
            type: 'core/object',
            label: 'Validation',
            description: 'Validation rules for the text field.',
            properties: {
                pattern: {
                    type: 'string',
                    default: '^[a-zA-Z0-9_\\- ]*$',
                    label: 'Pattern',
                    description: 'Regular expression pattern for validation.'
                },
                message: {
                    type: 'string',
                    default:
                        'Only alphanumeric characters, underscores, hyphens, and spaces are allowed.',
                    label: 'Error Message',
                    description: 'Error message when validation fails.'
                }
            }
        },
        placeholder: {
            type: 'core/string',
            default: '',
            label: 'Placeholder',
            description: 'Placeholder text for the field.'
        },
        autocomplete: {
            type: 'core/boolean',
            default: false,
            label: 'Enable autocomplete',
            description: 'Whether to enable autocomplete for the field.'
        },
        ui: {
            type: 'core/text',
            label: 'UI Hint',
            description:
                'Optional hint for Studio input rendering (e.g. "input", "textarea", "email", "password"). Does not affect stored data.',
            required: false
        }
    }
});
