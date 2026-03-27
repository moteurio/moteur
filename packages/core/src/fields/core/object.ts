import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateObjectField } from '../../validators/fields/core/validateObjectField.js';

fieldRegistry.register({
    type: 'core/object',
    label: 'Object',
    description: 'Flexible key-value object.',
    validate: validateObjectField,
    fields: {
        value: {
            type: 'object',
            label: 'Data',
            description: 'The child fields of this object.',
            required: true
        }
    },
    optionsSchema: {
        allowEmpty: {
            type: 'boolean',
            default: true,
            label: 'Allow Empty',
            description: 'Whether the object can be empty.'
        },
        ui: {
            type: 'core/text',
            label: 'UI Hint',
            description: 'Optional hint for Studio input rendering. Does not affect stored data.',
            required: false
        }
    }
});
