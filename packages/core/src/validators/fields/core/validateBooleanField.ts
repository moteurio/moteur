import { Field } from '@moteurio/types/Field.js';
import { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import { isPlainObject } from '../../fieldValueUtils.js';

function resolveBoolean(value: unknown): boolean | 'invalid' {
    if (typeof value === 'boolean') {
        return value;
    }
    if (isPlainObject(value) && typeof value.value === 'boolean') {
        return value.value;
    }
    return 'invalid';
}

export function validateBooleanField(value: any, field: Field, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    const b = resolveBoolean(value);
    if (b === 'invalid') {
        issues.push({
            type: 'error',
            code: 'BOOLEAN_INVALID_TYPE',
            message: 'Expected a boolean or { value: boolean }.',
            path,
            context: { value }
        });
    }

    return issues;
}
