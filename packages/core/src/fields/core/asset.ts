import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateAssetField } from '../../validators/fields/core/validateAssetField.js';

fieldRegistry.register({
    type: 'core/asset',
    label: 'Asset',
    description:
        'Reference to a project asset (image, video, or document) with optional usage-level alt and caption.',
    storeDirect: true,
    validate: validateAssetField,
    optionsSchema: {
        ui: {
            type: 'core/text',
            label: 'UI Hint',
            description:
                'Optional hint for Studio input rendering (e.g. "upload", "url"). Does not affect stored data.',
            required: false
        }
    }
});
