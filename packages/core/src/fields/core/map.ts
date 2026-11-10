import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateMapField } from '../../validators/fields/core/validateMapField.js';

/**
 * Maps keys to values, where every value has the same field type. Examples are a translation per
 * language, a label per plan, or an answer per question. It is stored as an object
 * (`{ "en": "Hello", "fr": "Bonjour" }`). `keys` lists the keys the map may have, in the order
 * editors show them. Without `keys`, any key is allowed.
 */
fieldRegistry.register({
    type: 'core/map',
    label: 'Map',
    description: 'Keys to values, each value of one field type. Stored as an object.',
    storeDirect: true,
    validate: validateMapField,
    optionsSchema: {
        value: {
            type: 'core/object',
            label: 'Each value',
            description:
                'The field each key holds, e.g. `{ "type": "core/text" }` or an object with its own fields. Default: text.',
            required: false
        },
        keys: {
            type: 'core/list',
            label: 'Keys',
            description:
                'The keys it may have, in order: `["en", "fr"]` or `[{ "value": "en", "label": "English" }]`. Empty: any key.',
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
