import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateListField } from '../../validators/fields/core/validateListField.js';

fieldRegistry.register({
    type: 'core/list',
    label: 'List',
    description: 'A repeatable list of values or structured objects.',
    validate: validateListField,
    fields: {
        items: {
            type: 'core/object',
            label: 'Item Schema',
            description: 'Schema definition for each individual item in the list.',
            required: true,
            storeDirect: true
        }
    },
    optionsSchema: {
        allowEmpty: {
            type: 'core/boolean',
            default: false,
            label: 'Allow Empty',
            description: 'Whether the list can be empty.'
        },
        minItems: {
            type: 'core/number',
            label: 'Minimum Items',
            default: 0
        },
        maxItems: {
            type: 'core/number',
            label: 'Maximum Items'
        },
        sortable: {
            type: 'core/boolean',
            default: true,
            label: 'Sortable',
            description: 'Allow manual reordering of list items.'
        },
        uniqueItems: {
            type: 'core/boolean',
            default: false,
            label: 'Unique Items',
            description: 'Whether items in the list must be unique.'
        },
        ui: {
            type: 'core/text',
            label: 'UI Hint',
            description: 'Optional hint for Studio input rendering. Does not affect stored data.',
            required: false
        }
    }
});
