import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateDateTimeField } from '../../validators/fields/core/validateDatetimeField.js';

fieldRegistry.register({
    type: 'core/datetime',
    label: 'Date/Time',
    description: 'A date-time value.',
    storeDirect: true,
    validate: validateDateTimeField,
    fields: {
        value: {
            type: 'core/text',
            label: 'Value',
            description: 'The date-time value in ISO 8601 format (e.g., 2023-10-01T12:00:00Z).',
            options: {
                multilingual: false
            }
        }
    },
    optionsSchema: {
        format: {
            type: 'core/text',
            label: 'Date Format',
            description: 'Optional format for displaying the date (e.g., YYYY-MM-DD HH:mm:ss).'
        },
        placeholder: {
            type: 'core/text',
            label: 'Placeholder',
            description: 'Placeholder text for the date field.'
        },
        ui: {
            type: 'core/text',
            label: 'UI Hint',
            description: 'Optional hint for Studio input rendering. Does not affect stored data.',
            required: false
        }
    }
});
