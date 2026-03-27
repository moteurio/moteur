import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateMarkdownField } from '../../validators/fields/core/validateMarkdownField.js';

fieldRegistry.register({
    type: 'core/markdown',
    label: 'Markdown',
    description: 'CommonMark markdown. Multilingual support.',
    validate: validateMarkdownField,
    storeDirect: true,
    fields: {
        markdown: {
            type: 'core/text',
            label: 'Markdown Content',
            description: 'CommonMark markdown string.',
            multilingual: true
        }
    },
    optionsSchema: {
        allowHTML: {
            type: 'core/boolean',
            default: false,
            description: 'Allow raw HTML inside the markdown field.'
        },
        placeholder: {
            type: 'core/text',
            label: 'Placeholder',
            description: 'Placeholder text for the markdown editor.'
        },
        ui: {
            type: 'core/text',
            label: 'UI Hint',
            description: 'Optional hint for Studio input rendering. Does not affect stored data.',
            required: false
        }
    }
});
