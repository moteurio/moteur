import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateSelectField } from '../../validators/fields/core/validateSelectField.js';

/**
 * Workflow status for an entry. Opt-in — not on every model by default.
 */
fieldRegistry.register({
    type: 'core/status',
    label: 'Status',
    description: 'Workflow status for an entry. Opt-in — not on every model by default.',
    storeDirect: true,
    validate: validateSelectField,
    fields: {
        value: {
            type: 'core/text',
            label: 'Status',
            description: 'The workflow status value.',
            required: true
        }
    },
    optionsSchema: {
        values: {
            type: 'array',
            label: 'Status Values',
            description: 'Available status options.',
            items: {
                type: 'core/structure',
                subItems: {
                    type: 'object'
                }
            },
            default: [
                { value: 'draft', label: 'Draft' },
                { value: 'in_review', label: 'In Review' },
                { value: 'published', label: 'Published' }
            ],
            required: false
        },
        default: {
            type: 'core/text',
            label: 'Default Status',
            description: 'Default status on creation.',
            default: 'draft',
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
