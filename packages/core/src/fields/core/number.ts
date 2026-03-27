import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateNumberField } from '../../validators/fields/core/validateNumberField.js';

fieldRegistry.register({
    type: 'core/number',
    label: 'Number',
    description: 'A number.',
    validate: validateNumberField,
    storeDirect: true,
    fields: {
        value: {
            type: 'number',
            label: 'Value',
            description: 'The numeric value.'
        }
    },
    optionsSchema: {
        min: {
            type: 'number',
            default: null,
            label: 'Minimum Value',
            description: 'The minimum value allowed for the number.'
        },
        max: {
            type: 'number',
            default: null,
            label: 'Maximum Value',
            description: 'The maximum value allowed for the number.'
        },
        step: {
            type: 'number',
            default: 1,
            label: 'Step Increment',
            description: 'The increment step for the number input.'
        },
        placeholder: {
            type: 'string',
            default: '',
            label: 'Placeholder',
            description: 'Placeholder text for the number field.'
        },
        ui: {
            type: 'core/text',
            label: 'UI Hint',
            description:
                'Optional hint for Studio input rendering (e.g. "input", "slider", "rating"). Does not affect stored data.',
            required: false
        }
    }
});
