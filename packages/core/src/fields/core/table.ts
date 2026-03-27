import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateTableField } from '../../validators/fields/core/validateTableField.js';

fieldRegistry.register({
    type: 'core/table',
    label: 'Table',
    description: 'A 2D table with optional row/column titles and mixed cell types.',
    storeDirect: false,
    validate: validateTableField,
    fields: {
        rows: {
            type: 'core/list',
            label: 'Rows',
            options: {
                itemType: 'core/list',
                itemOptions: {
                    itemType: 'core/object',
                    allowEmpty: true
                }
            }
        },
        rowTitles: {
            type: 'core/list',
            label: 'Row Titles',
            description: 'Optional row header titles.',
            options: {
                itemType: 'core/text',
                allowEmpty: true
            }
        },
        columnTitles: {
            type: 'core/list',
            label: 'Column Titles',
            description: 'Optional column header titles.',
            options: {
                itemType: 'core/text',
                allowEmpty: true
            }
        },
        source: {
            type: 'core/link',
            label: 'Data Source',
            description: 'Optional external source for the table data (CSV, JSON, etc.).'
        }
    },
    optionsSchema: {
        validateCellSchema: {
            type: 'core/object',
            label: 'Validate Cell Schema',
            description:
                'Use a full Field schema for validating each cell. Leave empty for no validation.'
        },
        minRows: {
            type: 'core/number',
            label: 'Minimum Rows'
        },
        maxRows: {
            type: 'core/number',
            label: 'Maximum Rows'
        },
        minCols: {
            type: 'core/number',
            label: 'Minimum Columns'
        },
        maxCols: {
            type: 'core/number',
            label: 'Maximum Columns'
        },
        allowEmptyCells: {
            type: 'core/boolean',
            default: true,
            label: 'Allow Empty Cells'
        },
        ui: {
            type: 'core/text',
            label: 'UI Hint',
            description: 'Optional hint for Studio input rendering. Does not affect stored data.',
            required: false
        }
    }
});
