import type { Field, FieldValidationContext } from '@moteurio/types/Field.js';
import type { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import fieldRegistry from '../../../registry/FieldRegistry.js';
import { isPlainObject } from '../../fieldValueUtils.js';
import { validateFieldValue } from '../../validateFieldValue.js';

export function validateAddressField(
    value: any,
    field: Field,
    path: string,
    context?: FieldValidationContext
): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (value === null || value === undefined) {
        return issues;
    }

    if (!isPlainObject(value)) {
        issues.push({
            type: 'error',
            code: 'ADDRESS_INVALID_TYPE',
            message: 'Expected an address object.',
            path,
            context: { value }
        });
        return issues;
    }

    const def = fieldRegistry.get('core/address');
    const subFields = def.fields as Record<string, Field> | undefined;
    if (!subFields) {
        return issues;
    }

    for (const [key, subField] of Object.entries(subFields)) {
        const subPath = `${path}.${key}`;
        issues.push(...validateFieldValue(value[key], subField, subPath, context));
    }

    return issues;
}
