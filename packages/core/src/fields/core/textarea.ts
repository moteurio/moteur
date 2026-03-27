import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateTextField } from '../../validators/fields/core/validateTextField.js';

/**
 * Multi-line text field. Same storage shape as core/text; Studio renders it as a textarea.
 * Registered so API and validators accept type "core/textarea" from Studio-created models.
 */
fieldRegistry.register({
    type: 'core/textarea',
    label: 'Textarea',
    description:
        'A multi-line string field with multilingual support. Same value shape as core/text.',
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
            default: 65535,
            label: 'Max Length',
            description: 'Maximum length of the text field.'
        },
        minLength: {
            type: 'core/number',
            default: 0,
            label: 'Min Length',
            description: 'Minimum length of the text field.'
        },
        allowEmpty: {
            type: 'core/boolean',
            default: true,
            label: 'Allow Empty',
            description: 'Whether the field can be empty.'
        },
        placeholder: {
            type: 'core/text',
            default: '',
            label: 'Placeholder',
            description: 'Placeholder text for the field.'
        },
        ui: {
            type: 'core/text',
            label: 'UI Hint',
            description: 'Optional hint for Studio (e.g. "textarea"). Does not affect stored data.',
            required: false
        }
    }
});
