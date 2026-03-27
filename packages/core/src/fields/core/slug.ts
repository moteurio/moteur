import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateSlugField } from '../../validators/fields/core/validateSlugField.js';

fieldRegistry.register({
    type: 'core/slug',
    label: 'Slug',
    description: 'A URL-friendly identifier, usually generated from another field like title.',
    storeDirect: true,
    validate: validateSlugField,
    optionsSchema: {
        multilingual: {
            type: 'core/boolean',
            label: 'Multilingual',
            description: 'Whether the slug is multilingual.',
            default: false
        },
        sourceField: {
            type: 'core/text',
            label: 'Source Field',
            description: 'Field to generate slug from if not manually entered (e.g., title).'
        },
        separator: {
            type: 'core/text',
            label: 'Separator',
            description: "Character used to separate words (default: '-').",
            default: '-'
        },
        uniqueScope: {
            type: 'core/select',
            label: 'Uniqueness Scope',
            description: 'Scope for slug uniqueness (e.g., project, model, etc.).',
            choices: [
                { value: 'global', label: 'Global' },
                { value: 'model', label: 'Model' },
                { value: 'none', label: 'None' }
            ],
            default: 'model'
        },
        allowCustom: {
            type: 'core/boolean',
            label: 'Allow Manual Entry',
            description: 'Whether editors can manually override the slug.',
            default: true
        },
        lowercase: {
            type: 'core/boolean',
            label: 'Lowercase',
            description: 'Whether the slug should be forced to lowercase.',
            default: true
        },
        ui: {
            type: 'core/text',
            label: 'UI Hint',
            description: 'Optional hint for Studio input rendering. Does not affect stored data.',
            required: false
        }
    }
});
