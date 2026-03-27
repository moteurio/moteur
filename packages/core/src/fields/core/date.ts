import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateDateTimeField } from '../../validators/fields/core/validateDatetimeField.js';

fieldRegistry.register({
    type: 'core/date',
    label: 'Date',
    description: 'A date value stored as ISO 8601 date string (YYYY-MM-DD).',
    storeDirect: true,
    validate: validateDateTimeField,
    fields: {
        value: {
            type: 'core/text',
            label: 'Date',
            description: 'The date value in YYYY-MM-DD format.',
            required: true
        }
    },
    optionsSchema: {
        min: {
            type: 'core/text',
            label: 'Minimum Date',
            description: 'Minimum allowed date (YYYY-MM-DD).',
            required: false
        },
        max: {
            type: 'core/text',
            label: 'Maximum Date',
            description: 'Maximum allowed date (YYYY-MM-DD).',
            required: false
        },
        placeholder: {
            type: 'core/text',
            label: 'Placeholder',
            description: 'Placeholder text for the date field.',
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
