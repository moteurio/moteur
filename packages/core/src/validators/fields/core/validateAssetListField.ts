import type { Field } from '@moteurio/types/Field.js';
import type { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import { validateAssetField } from './validateAssetField.js';

export function validateAssetListField(value: any, field: Field, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (!Array.isArray(value)) {
        issues.push({
            type: 'error',
            code: 'ASSET_LIST_INVALID_TYPE',
            message: 'Expected an array of asset objects.',
            path,
            context: { value }
        });
        return issues;
    }

    const { minItems, maxItems } = (field.options ?? {}) as {
        minItems?: number;
        maxItems?: number;
    };
    if (typeof minItems === 'number' && value.length < minItems)
        issues.push({
            type: 'error',
            code: 'ASSET_LIST_TOO_FEW',
            message: `At least ${minItems} needed (${value.length} here).`,
            path,
            context: { count: value.length, min: minItems }
        });
    if (typeof maxItems === 'number' && value.length > maxItems)
        issues.push({
            type: 'error',
            code: 'ASSET_LIST_TOO_MANY',
            message: `At most ${maxItems} (${value.length} here).`,
            path,
            context: { count: value.length, max: maxItems }
        });

    value.forEach((item, i) => {
        issues.push(...validateAssetField(item, field, `${path}[${i}]`));
    });

    return issues;
}
