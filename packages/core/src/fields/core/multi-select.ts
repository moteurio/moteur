import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateMultiSelectField } from '../../validators/fields/core/validateMultiSelectField.js';

/**
 * Preferred way to express multi-value selects in new schemas.
 * Stored as string array. For inline free-text tags with no external source, use ui: "tag".
 * For tags referencing an external tag model, use core/tags.
 */
fieldRegistry.register({
    type: 'core/multi-select',
    label: 'Multi Select',
    description: 'Multiple choices from predefined options. Stored as string array.',
    storeDirect: true,
    validate: validateMultiSelectField,
    fields: {
        value: {
            type: 'string',
            label: 'Values',
            description: 'The selected values from the options (stored as string[]).',
            multilingual: true,
            required: false
        }
    },
    optionsSchema: {
        choices: {
            type: 'array',
            multilingual: true,
            required: true,
            items: {
                type: 'core/structure',
                subItems: {
                    type: 'object'
                }
            },
            label: 'Choices',
            description: 'Available options for selection.'
        },
        allowEmpty: {
            type: 'core/boolean',
            default: false,
            label: 'Allow Empty',
            description: 'Whether the select can be empty.'
        },
        placeholder: {
            type: 'core/text',
            label: 'Placeholder',
            description: 'Placeholder text for the select field.'
        },
        ui: {
            type: 'core/text',
            label: 'UI Hint',
            description:
                'Optional hint for Studio input rendering (e.g. "dropdown", "checkbox", "tag"). Does not affect stored data.',
            required: false
        }
    }
});
