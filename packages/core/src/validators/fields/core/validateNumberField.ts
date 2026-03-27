import { Field } from '@moteurio/types/Field.js';
import { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import { isPlainObject } from '../../fieldValueUtils.js';

function resolveNumber(value: unknown): number | 'invalid' {
    if (typeof value === 'number' && !Number.isNaN(value)) {
        return value;
    }
    if (isPlainObject(value) && typeof value.value === 'number' && !Number.isNaN(value.value)) {
        return value.value;
    }
    return 'invalid';
}

export function validateNumberField(value: any, field: Field, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    const n = resolveNumber(value);
    if (n === 'invalid') {
        issues.push({
            type: 'error',
            code: 'NUMBER_INVALID_TYPE',
            message: 'Expected a number or { value: number }.',
            path,
            context: { value }
        });
        return issues;
    }

    const opts = field.options || {};

    if (opts.min !== undefined && opts.min !== null && n < opts.min) {
        issues.push({
            type: 'error',
            code: 'NUMBER_BELOW_MIN',
            message: `Value is too small (min ${opts.min}).`,
            path,
            context: { value: n }
        });
    }
    if (opts.max !== undefined && opts.max !== null && n > opts.max) {
        issues.push({
            type: 'error',
            code: 'NUMBER_ABOVE_MAX',
            message: `Value is too large (max ${opts.max}).`,
            path,
            context: { value: n }
        });
    }

    return issues;
}
