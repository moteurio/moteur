import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateBooleanField } from '../../validators/fields/core/validateBooleanField.js';

fieldRegistry.register({
    type: 'core/boolean',
    label: 'Boolean',
    description: 'A true/false toggle field.',
    storeDirect: true,
    validate: validateBooleanField,
    fields: {
        value: {
            type: 'core/boolean',
            label: 'Value',
            description: 'The boolean value of this field.',
            default: false
        }
    },
    optionsSchema: {
        trueLabel: {
            type: 'core/text',
            default: 'Yes',
            label: 'True Label',
            description: 'Label for the true state.'
        },
        falseLabel: {
            type: 'core/text',
            default: 'No',
            label: 'False Label',
            description: 'Label for the false state.'
        },
        ui: {
            type: 'core/text',
            label: 'UI Hint',
            description:
                'Optional hint for Studio input rendering (e.g. "toggle", "checkbox"). Does not affect stored data.',
            required: false
        }
    }
});
