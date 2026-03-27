import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateLayoutField } from '../../validators/fields/core/validateLayoutField.js';

/**
 * References a project Layout resource: fixed block types/order come from the layout file;
 * stored value only fills slot content (`layoutId` + `slots` with `id` + `data`).
 * Deep validation runs at save time (see validateLayoutFieldValues).
 *
 * Value shape: { layoutId: string, slots: Array<{ id: string, data: Record<string, unknown> }> }
 * Slot id matches Layout.blocks[i].meta.id when set, otherwise the string index "0","1",...
 */
fieldRegistry.register({
    type: 'core/layout',
    label: 'Layout',
    description:
        'Preset block regions from a project Layout. Editors fill slots; structure and order come from the Layout resource.',
    storeDirect: true,
    validate: validateLayoutField,
    optionsSchema: {
        defaultLayoutId: {
            type: 'core/text',
            label: 'Fixed layout id',
            description: 'If set, layoutId in stored value must match this layout id.',
            required: false,
            options: { multilingual: false }
        },
        allowEmpty: {
            type: 'core/boolean',
            default: false,
            label: 'Allow empty',
            description: 'Whether the field may be null/undefined.'
        }
    }
});
