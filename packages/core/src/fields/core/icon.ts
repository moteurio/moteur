import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateTextField } from '../../validators/fields/core/validateTextField.js';

/**
 * Icon identifier string. Refers to whatever icon system the project uses. No validation.
 */
fieldRegistry.register({
    type: 'core/icon',
    label: 'Icon',
    description:
        'An icon identifier string. Refers to whatever icon system the project uses. No validation.',
    storeDirect: true,
    validate: validateTextField,
    fields: {
        value: {
            type: 'core/text',
            label: 'Icon',
            description: 'The icon identifier (e.g. "lucide:home", "heroicons:user").',
            required: true
        }
    },
    optionsSchema: {
        set: {
            type: 'core/text',
            label: 'Icon Set',
            description: 'Optional hint for which icon set to use (e.g. "lucide", "heroicons").',
            required: false
        },
        ui: {
            type: 'core/text',
            label: 'UI Hint',
            description:
                'Optional hint for Studio input rendering (e.g. "picker", "input"). Does not affect stored data.',
            required: false
        }
    }
});
