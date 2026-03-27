import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateLinkField } from '../../validators/fields/core/validateLinkField.js';

fieldRegistry.register({
    type: 'core/link',
    label: 'Link',
    description:
        'A structured hyperlink with label, accessibility options, and visual customization.',
    validate: validateLinkField,
    resolveValue: false,
    fields: {
        url: {
            type: 'core/text',
            label: 'URL',
            required: true
        },
        label: {
            type: 'core/text',
            multilingual: true,
            label: 'Link Text'
        },
        ariaLabel: {
            type: 'core/text',
            multilingual: true,
            label: 'ARIA Label'
        }
    },
    optionsSchema: {
        target: {
            type: 'core/select',
            label: 'Target',
            options: [
                { value: '_self', label: '_self' },
                { value: '_blank', label: '_blank' }
            ],
            default: '_self'
        },
        rel: {
            type: 'core/list',
            label: 'Rel Attributes',
            default: [],
            fields: {
                value: {
                    type: 'core/text'
                }
            },
            optionsSchema: {
                allowEmpty: {
                    type: 'core/boolean',
                    default: true
                }
            }
        },
        icon: {
            type: 'core/text',
            label: 'Icon'
        },
        isButton: {
            type: 'core/boolean',
            label: 'Render as Button'
        },
        download: {
            type: 'core/boolean',
            default: false,
            label: 'Download',
            description: 'Add download attribute to the link for file downloads.'
        },
        prefetch: {
            type: 'core/boolean',
            default: false,
            label: 'Prefetch',
            description: 'Enable route prefetching or link hinting if supported.'
        },
        relativeOnly: {
            type: 'core/boolean',
            default: false,
            label: 'Relative Only',
            description: 'Restrict the link to relative URLs only.'
        },
        ui: {
            type: 'core/text',
            label: 'UI Hint',
            description: 'Optional hint for Studio input rendering. Does not affect stored data.',
            required: false
        }
    }
});
