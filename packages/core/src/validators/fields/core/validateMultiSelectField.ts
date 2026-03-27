import { Field } from '@moteurio/types/Field.js';
import { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import { isPlainObject } from '../../fieldValueUtils.js';

function allowedChoiceSet(field: Field): Set<string> | null {
    const opts = field.options || {};
    const choices = Array.isArray(opts) ? opts : (opts?.choices ?? opts?.values);
    if (!Array.isArray(choices) || choices.length === 0) {
        return null;
    }
    const allowed = choices.map((c: unknown) =>
        typeof c === 'string' ? c : (c as { value?: string })?.value
    );
    return new Set(allowed.filter((x): x is string => typeof x === 'string'));
}

export function validateMultiSelectField(
    value: any,
    field: Field,
    path: string
): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const allowEmpty = field.options?.allowEmpty === true;

    let arr = value;
    if (isPlainObject(value) && Array.isArray(value.value)) {
        arr = value.value;
    }

    if (!Array.isArray(arr)) {
        issues.push({
            type: 'error',
            code: 'MULTI_SELECT_INVALID_TYPE',
            message: 'Expected an array of strings or { value: string[] }.',
            path,
            context: { value }
        });
        return issues;
    }

    if (!allowEmpty && arr.length === 0) {
        issues.push({
            type: 'error',
            code: 'MULTI_SELECT_EMPTY',
            message: 'At least one selection is required.',
            path,
            context: { value: arr }
        });
    }

    const allowed = allowedChoiceSet(field);

    arr.forEach((item, index) => {
        const ip = `${path}[${index}]`;
        if (typeof item !== 'string') {
            issues.push({
                type: 'error',
                code: 'MULTI_SELECT_ITEM_INVALID_TYPE',
                message: 'Each selection must be a string.',
                path: ip,
                context: { item }
            });
            return;
        }
        if (allowed && !allowed.has(item)) {
            issues.push({
                type: 'error',
                code: 'MULTI_SELECT_INVALID_CHOICE',
                message: `Value "${item}" is not a valid choice.`,
                path: ip,
                context: { item, allowed: [...allowed] }
            });
        }
    });

    return issues;
}
