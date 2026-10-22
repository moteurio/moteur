import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateAssetListField } from '../../validators/fields/core/validateAssetListField.js';

fieldRegistry.register({
    type: 'core/asset-list',
    label: 'Asset list',
    description: 'List of project asset references with optional usage-level alt and caption.',
    storeDirect: true,
    validate: validateAssetListField,
    optionsSchema: {
        aspectRatio: {
            type: 'core/select',
            label: 'Crop to',
            options: ['1:1', '4:3', '3:2', '16:9', '21:9', '3:4', '2:3', '9:16'],
            description:
                'Pictures here are cropped to this shape around their focal point (`cropUrl` when assets are resolved). Empty: as uploaded.',
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
