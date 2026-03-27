import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateBlockListField } from '../../validators/fields/core/validateBlockListField.js';

/**
 * Freeform ordered list of block instances (block canvas). Editors may add, remove, and reorder
 * blocks within optional allowlist and count limits. Same item shape as Layout.blocks.
 */
fieldRegistry.register({
    type: 'core/block-list',
    label: 'Block canvas',
    description:
        'Ordered block instances (add / reorder / remove). Use for freeform page or entry bodies.',
    storeDirect: true,
    validate: validateBlockListField,
    optionsSchema: {
        allowedBlockTypes: {
            type: 'core/json',
            label: 'Allowed block types',
            description:
                'Optional JSON array of block type ids (e.g. ["core/paragraph","core/heading"]). Empty = all registered blocks.',
            required: false
        },
        minBlocks: {
            type: 'core/number',
            label: 'Minimum blocks',
            description: 'Minimum number of blocks (default 0).',
            required: false
        },
        maxBlocks: {
            type: 'core/number',
            label: 'Maximum blocks',
            description: 'Maximum number of blocks (optional).',
            required: false
        },
        allowEmpty: {
            type: 'core/boolean',
            default: false,
            label: 'Allow empty',
            description: 'Whether the field may be null/undefined.'
        }
    }
});
