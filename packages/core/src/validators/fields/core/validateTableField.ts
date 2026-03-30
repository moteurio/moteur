import type { Field, FieldValidationContext } from '@moteurio/types/Field.js';
import { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import { isPlainObject } from '../../fieldValueUtils.js';
import { validateFieldValue } from '../../validateFieldValue.js';

/**
 * Normalize stored table: legacy array-of-rows, or `{ rows: [...] }` from `storeDirect: false` + `value.rows`.
 */
function extractRows(value: unknown): { rows: unknown[][]; error?: ValidationIssue } {
    if (Array.isArray(value)) {
        return { rows: value as unknown[][] };
    }
    if (isPlainObject(value) && Array.isArray(value.rows)) {
        return { rows: value.rows as unknown[][] };
    }
    return {
        rows: [],
        error: {
            type: 'error',
            code: 'TABLE_INVALID_FORMAT',
            message: 'Table must be an array of rows or an object with a "rows" array.',
            path: '',
            context: { actualValue: value }
        }
    };
}

/**
 * Validates a core/table field.
 */
export function validateTableField(
    value: any,
    field: Field,
    path: string,
    context?: FieldValidationContext
): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const options = field.options || {};

    const { rows, error } = extractRows(value);
    if (error) {
        issues.push({ ...error, path });
        return issues;
    }

    if (options.minRows && rows.length < options.minRows) {
        issues.push({
            type: 'error',
            code: 'TABLE_TOO_FEW_ROWS',
            message: `Table must have at least ${options.minRows} rows.`,
            path
        });
    }
    if (options.maxRows && rows.length > options.maxRows) {
        issues.push({
            type: 'error',
            code: 'TABLE_TOO_MANY_ROWS',
            message: `Table must have at most ${options.maxRows} rows.`,
            path
        });
    }

    const cellSchema: Field | undefined = options.validateCellSchema;
    const allowEmpty = options.allowEmptyCells !== false;

    rows.forEach((row: unknown, rowIndex: number) => {
        const rowPath = `${path}[${rowIndex}]`;
        if (!Array.isArray(row)) {
            issues.push({
                type: 'error',
                code: 'TABLE_INVALID_ROW',
                message: `Row ${rowIndex} must be an array.`,
                path: rowPath
            });
            return;
        }

        if (options.minCols && row.length < options.minCols) {
            issues.push({
                type: 'error',
                code: 'TABLE_TOO_FEW_COLUMNS',
                message: `Row ${rowIndex} must have at least ${options.minCols} columns.`,
                path: rowPath
            });
        }
        if (options.maxCols && row.length > options.maxCols) {
            issues.push({
                type: 'error',
                code: 'TABLE_TOO_MANY_COLUMNS',
                message: `Row ${rowIndex} must have at most ${options.maxCols} columns.`,
                path: rowPath
            });
        }

        row.forEach((cell, colIndex) => {
            const cellPath = `${rowPath}[${colIndex}]`;

            if ((cell === '' || cell === null) && allowEmpty) {
                return;
            }

            if (cellSchema) {
                const cellIssues = validateFieldValue(cell, cellSchema, cellPath, context);
                issues.push(...cellIssues);
            }
        });
    });

    return issues;
}
