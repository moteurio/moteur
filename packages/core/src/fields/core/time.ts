import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateDateTimeField } from '../../validators/fields/core/validateDatetimeField.js';

fieldRegistry.register({
    type: 'core/time',
    label: 'Time',
    description: 'A time value stored as HH:MM string.',
    storeDirect: true,
    validate: validateDateTimeField,
    fields: {
        value: {
            type: 'core/text',
            label: 'Time',
            description: 'The time value in HH:MM format.',
            required: true
        }
    },
    optionsSchema: {
        min: {
            type: 'core/text',
            label: 'Minimum Time',
            description: 'Minimum allowed time (HH:MM).',
            required: false
        },
        max: {
            type: 'core/text',
            label: 'Maximum Time',
            description: 'Maximum allowed time (HH:MM).',
            required: false
        },
        step: {
            type: 'core/number',
            label: 'Step (minutes)',
            description: 'Step increment for time input in minutes.',
            default: 15,
            required: false
        },
        ui: {
            type: 'core/text',
            label: 'UI Hint',
            description: 'Optional hint for Studio input rendering. Does not affect stored data.',
            required: false
        }
    }
});
