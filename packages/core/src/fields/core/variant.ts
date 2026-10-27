import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateVariantField } from '../../validators/fields/core/validateVariantField.js';

/**
 * One of several shapes, chosen by `kind`: an exhibit that is an image, a code listing or a
 * video. Stored flat, the chosen variant's fields beside its kind:
 * `{ "kind": "image", "src": { "assetId": "…" }, "alt": { "en": "…" } }`.
 */
fieldRegistry.register({
    type: 'core/variant',
    label: 'Variant',
    description: 'One of several shapes, each with its own fields, chosen by its kind.',
    storeDirect: true,
    validate: validateVariantField,
    fields: {
        kind: {
            type: 'core/text',
            label: 'Kind',
            description: 'The chosen variant, one of the keys of `options.variants`.',
            required: true
        }
    },
    optionsSchema: {
        variants: {
            type: 'core/object',
            label: 'Variants',
            description:
                'The shapes, by kind: `{ "image": { "label": "Image", "fields": { … } } }`. The order is the order Studio offers them in.',
            required: true
        },
        default: {
            type: 'core/text',
            label: 'Default kind',
            description: 'The kind a new value starts as. Default: the first variant.',
            required: false
        },
        allowEmpty: {
            type: 'core/boolean',
            default: false,
            label: 'Allow Empty',
            description: 'Whether the field can be left without a value.'
        },
        ui: {
            type: 'core/text',
            label: 'UI Hint',
            description: 'Optional hint for Studio input rendering. Does not affect stored data.',
            required: false
        }
    }
});
