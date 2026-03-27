import { Field } from '@moteurio/types/Field.js';
import { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import { isPlainObject } from '../../fieldValueUtils.js';
import { validateRelationField } from './validateRelationField.js';

export function validateRelationsField(value: any, field: Field, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    let arr = value;
    if (isPlainObject(value) && Array.isArray(value.value)) {
        arr = value.value;
    }

    if (!Array.isArray(arr)) {
        issues.push({
            type: 'error',
            code: 'RELATIONS_INVALID_TYPE',
            message: 'Expected an array of relation references or { value: array }.',
            path,
            context: { value }
        });
        return issues;
    }

    const allowEmpty = field.options?.allowEmpty !== false;
    if (!allowEmpty && arr.length === 0) {
        issues.push({
            type: 'error',
            code: 'RELATIONS_EMPTY',
            message: 'At least one relation is required.',
            path,
            context: { value: arr }
        });
    }

    if (field.options?.minItems !== undefined && arr.length < field.options.minItems) {
        issues.push({
            type: 'error',
            code: 'RELATIONS_TOO_FEW',
            message: `Must have at least ${field.options.minItems} relations.`,
            path,
            context: { count: arr.length, min: field.options.minItems }
        });
    }

    if (field.options?.maxItems !== undefined && arr.length > field.options.maxItems) {
        issues.push({
            type: 'error',
            code: 'RELATIONS_TOO_MANY',
            message: `Must have at most ${field.options.maxItems} relations.`,
            path,
            context: { count: arr.length, max: field.options.maxItems }
        });
    }

    const singleField: Field = {
        type: 'core/relation',
        label: field.label,
        options: {
            ...field.options,
            allowEmpty: false
        }
    };
    arr.forEach((item, index) => {
        const itemIssues = validateRelationField(item, singleField, `${path}[${index}]`);
        issues.push(...itemIssues);
    });

    return issues;
}
