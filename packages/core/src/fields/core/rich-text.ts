import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateDastStoredField } from '../../validators/fields/core/validateDastField.js';

/**
 * Structured rich text in DAST format (Document Abstract Syntax Tree).
 * Use core/html for raw HTML (legacy/easy imports) and core/markdown for CommonMark.
 */
fieldRegistry.register({
    type: 'core/rich-text',
    label: 'Rich Text',
    description: 'Structured rich text in DAST format.',
    validate: validateDastStoredField,
    storeDirect: true,
    fields: {
        dast: {
            type: 'core/json',
            label: 'DAST Document',
            description: 'Structured rich text (DAST).',
            multilingual: true,
            required: true
        }
    },
    optionsSchema: {
        allowEmpty: {
            type: 'core/boolean',
            default: true,
            label: 'Allow Empty',
            description: 'Whether the field can be empty (empty root children).'
        },
        ui: {
            type: 'core/text',
            label: 'UI Hint',
            description: 'Optional hint for Studio input rendering.',
            required: false
        }
    }
});
