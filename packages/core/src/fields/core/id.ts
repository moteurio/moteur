import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateTextField } from '../../validators/fields/core/validateTextField.js';

/**
 * Unique identifier. Auto-generated UUID. Read-only — never writable via API.
 * - Auto-generated on entry creation
 * - Never accepted in create/update payloads — ignored if provided
 * - Always returned in API responses
 * - Studio renders as read-only, non-editable
 */
fieldRegistry.register({
    type: 'core/id',
    label: 'ID',
    description: 'A unique identifier. Auto-generated UUID. Read-only — never writable via API.',
    storeDirect: true,
    validate: validateTextField,
    fields: {
        value: {
            type: 'core/text',
            label: 'ID',
            description: 'The UUID value.',
            required: true
        }
    },
    optionsSchema: {
        ui: {
            type: 'core/text',
            label: 'UI Hint',
            description: 'Optional hint for Studio input rendering. Does not affect stored data.',
            required: false
        }
    }
});
