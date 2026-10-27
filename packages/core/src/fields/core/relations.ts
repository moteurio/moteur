import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateRelationsField } from '../../validators/fields/core/validateRelationsField.js';

/**
 * References to multiple entries in another model, or to pages with `target: "pages"`. Stored
 * as an array of ids (or { id, … }); delivery turns pages into { id, label, url, fields }.
 */
fieldRegistry.register({
    type: 'core/relations',
    label: 'Relations',
    description: 'References to multiple entries in another model, or to pages. Stored as array.',
    storeDirect: true,
    validate: validateRelationsField,
    fields: {
        value: {
            type: 'core/list',
            label: 'Relations',
            description: 'Array of reference objects with id, label, model.',
            required: false,
            options: {
                itemType: 'core/object',
                allowEmpty: true
            }
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
            default: true,
            label: 'Allow Empty',
            description: 'Whether the relations list can be empty.'
        },
        sortable: {
            type: 'core/boolean',
            default: true,
            label: 'Sortable',
            description: 'Allow manual reordering of relations.'
        },
        minItems: {
            type: 'core/number',
            default: 0,
            label: 'Minimum Items',
            description: 'Minimum number of relations required.',
            required: false
        },
        maxItems: {
            type: 'core/number',
            label: 'Maximum Items',
            description: 'Maximum number of relations allowed.',
            required: false
        },
        ui: {
            type: 'core/text',
            label: 'UI Hint',
            description:
                'Optional hint for Studio input rendering (e.g. "search", "tag"). Does not affect stored data.',
            required: false
        }
    }
});
