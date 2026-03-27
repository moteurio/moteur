import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateNumberField } from '../../validators/fields/core/validateNumberField.js';

/**
 * Manual sort order. Integer. Opt-in — not on every model by default.
 */
fieldRegistry.register({
    type: 'core/order',
    label: 'Order',
    description: 'Manual sort order. Integer. Opt-in — not on every model by default.',
    storeDirect: true,
    validate: validateNumberField,
    fields: {
        value: {
            type: 'core/number',
            label: 'Order',
            description: 'The sort order value (integer).',
            required: true
        }
    },
    optionsSchema: {
        default: {
            type: 'core/number',
            default: 0,
            label: 'Default Order',
            description: 'Default order value on creation.',
            required: false
        },
        ui: {
            type: 'core/text',
            label: 'UI Hint',
            description:
                'Optional hint for Studio input rendering (e.g. "input", "drag-handle"). Does not affect stored data.',
            required: false
        }
    }
});
