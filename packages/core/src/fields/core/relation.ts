import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateRelationField } from '../../validators/fields/core/validateRelationField.js';

/**
 * Reference to a single entry in another model. Stored as { id, label, model }.
 */
fieldRegistry.register({
    type: 'core/relation',
    label: 'Relation',
    description: 'A reference to a single entry in another model.',
    storeDirect: true,
    validate: validateRelationField,
    fields: {
        value: {
            type: 'core/object',
            label: 'Relation',
            description: 'Reference object with id, label, model.',
            required: false
        }
    },
    optionsSchema: {
        model: {
            type: 'core/text',
            label: 'Model',
            description: 'The model ID to reference (required).',
            required: true
        },
        labelField: {
            type: 'core/text',
            label: 'Label Field',
            description: 'Which field to use as label in the UI. Default: first text field.',
            required: false
        },
        allowEmpty: {
            type: 'core/boolean',
            default: false,
            label: 'Allow Empty',
            description: 'Whether the relation can be empty.'
        },
        ui: {
            type: 'core/text',
            label: 'UI Hint',
            description:
                'Optional hint for Studio input rendering (e.g. "search", "dropdown"). Does not affect stored data.',
            required: false
        }
    }
});
