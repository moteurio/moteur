import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateAddressField } from '../../validators/fields/core/validateAddressField.js';

fieldRegistry.register({
    type: 'core/address',
    label: 'Address',
    description: 'A structured postal address.',
    validate: validateAddressField,
    fields: {
        street: {
            type: 'core/text',
            label: 'Street',
            description: 'Street address.',
            required: false
        },
        city: {
            type: 'core/text',
            label: 'City',
            description: 'City.',
            required: false
        },
        state: {
            type: 'core/text',
            label: 'State / Province',
            description: 'State or province.',
            required: false
        },
        country: {
            type: 'core/text',
            label: 'Country',
            description: 'Country.',
            required: false
        },
        postalCode: {
            type: 'core/text',
            label: 'Postal Code',
            description: 'Postal or ZIP code.',
            required: false
        }
    },
    optionsSchema: {
        ui: {
            type: 'core/text',
            label: 'UI Hint',
            description: 'Optional hint for Studio input rendering. Does not affect stored data.',
            required: false
        }
    }
});
