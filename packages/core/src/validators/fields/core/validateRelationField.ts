import { Field } from '@moteurio/types/Field.js';
import { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import { isPlainObject } from '../../fieldValueUtils.js';

/** Empty allowed only when `options.allowEmpty === true` (default: required). */
function allowEmptyRelation(field: Field): boolean {
    return field.options?.allowEmpty === true;
}

export function validateRelationField(value: any, field: Field, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    let v = value;
    if (isPlainObject(value) && 'value' in value && value.value !== undefined) {
        v = value.value;
    }

    if (v === null || v === undefined) {
        if (!allowEmptyRelation(field)) {
            issues.push({
                type: 'error',
                code: 'RELATION_EMPTY',
                message: 'A relation reference is required.',
                path,
                context: { value }
            });
        }
        return issues;
    }

    if (typeof v === 'string') {
        if (v.trim() === '' && !allowEmptyRelation(field)) {
            issues.push({
                type: 'error',
                code: 'RELATION_EMPTY',
                message: 'Relation ID cannot be empty.',
                path,
                context: { value }
            });
        }
        return issues;
    }

    if (typeof v === 'object' && !Array.isArray(v)) {
        if (!v.id || typeof v.id !== 'string') {
            issues.push({
                type: 'error',
                code: 'RELATION_MISSING_ID',
                message: 'Relation reference must have a string "id" property.',
                path,
                context: { value: v }
            });
        }
        return issues;
    }

    issues.push({
        type: 'error',
        code: 'RELATION_INVALID_TYPE',
        message: 'Relation must be a string ID or an object with an "id" property.',
        path,
        context: { value }
    });

    return issues;
}
