import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateMapField } from '../../validators/fields/core/validateMapField.js';

/**
 * Keys to values, each of one field type: a translation per language, a label per plan, an
 * answer per question. Stored as an object (`{ "en": "Hello", "fr": "Bonjour" }`). `keys` lists
 * the keys it may have (and their order in the Studio); without it, any key.
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
