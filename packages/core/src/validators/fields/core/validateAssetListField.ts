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

    value.forEach((item, i) => {
        issues.push(...validateAssetField(item, field, `${path}[${i}]`));
    });

    return issues;
}
