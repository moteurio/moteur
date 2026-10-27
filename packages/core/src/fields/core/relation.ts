import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateRelationField } from '../../validators/fields/core/validateRelationField.js';

/**
 * Reference to a single entry in another model, or to a page with `target: "pages"`. Stored as
 * the id (or { id, … }); delivery turns a page into { id, label, url, fields }.
 */
fieldRegistry.register({
    type: 'core/relation',
    label: 'Relation',
    description: 'A reference to a single entry in another model, or to a page.',
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
        target: {
            type: 'core/select',
            label: 'Points at',
            description: 'Entries of a model (the default), or pages of the site.',
            options: [
                { value: 'entries', label: 'Entries' },
                { value: 'pages', label: 'Pages' }
            ],
            default: 'entries',
            required: false
        },
        model: {
            type: 'core/text',
            label: 'Model',
            description: 'The model ID to reference (required unless it points at pages).',
            required: false
        },
        fields: {
            type: 'core/list',
            label: 'Page fields',
            description:
                'For pages: the fields of each page delivered with it (e.g. ["seo"]). Its id, label and address always are.',
            required: false
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
