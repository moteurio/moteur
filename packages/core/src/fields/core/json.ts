import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateJsonField } from '../../validators/fields/core/validateJsonField.js';

/**
 * Raw JSON blob. Escape hatch for unstructured or developer-defined data.
 * Must be valid JSON on save. If schema provided in options, validate against it.
 */
fieldRegistry.register({
    type: 'core/json',
    label: 'JSON',
    description: 'A raw JSON blob. Escape hatch for unstructured or developer-defined data.',
    storeDirect: true,
    validate: validateJsonField,
    fields: {
        value: {
            type: 'core/object',
            label: 'JSON Data',
            description: 'The raw JSON value.',
            required: false
        }
    },
    optionsSchema: {
        schema: {
            type: 'core/object',
            label: 'JSON Schema',
            description: 'Optional JSON Schema for validation if desired.',
            required: false
        },
        allowEmpty: {
            type: 'core/boolean',
            default: false,
            label: 'Allow Empty',
            description: 'Whether the field can be empty.'
        },
        ui: {
            type: 'core/text',
            label: 'UI Hint',
            description:
                'Optional hint for Studio input rendering (e.g. "editor", "textarea"). Does not affect stored data.',
            required: false
        }
    }
});
