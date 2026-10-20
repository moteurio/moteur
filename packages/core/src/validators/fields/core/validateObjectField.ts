import type { Field, FieldValidationContext } from '@moteurio/types/Field.js';
import { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import { isPlainObject } from '../../fieldValueUtils.js';
import { validateFieldValue } from '../../validateFieldValue.js';
import { isFieldRequired, isMissingValue } from '../../validateFieldsAgainstSchema.js';

export function validateObjectField(
    value: any,
    field: Field,
    path: string,
    context?: FieldValidationContext
): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        issues.push({
            type: 'error',
            code: 'OBJECT_INVALID_TYPE',
            message: 'Expected an object.',
            path,
            context: { value }
        });
        return issues;
    }

    const v = value as Record<string, unknown>;
    const childFields =
        (field.data as Record<string, Field> | undefined) ??
        ((field as Field & { fields?: Record<string, Field> }).fields as
            Record<string, Field> | undefined) ??
        ((field as Field & { properties?: Record<string, Field> }).properties as
            Record<string, Field> | undefined) ??
        {};

    // Accept the wrapped form { value: { …fields } }, unless "value" is one of the object's
    // own fields (e.g. a { label, value } pair), which must not be mistaken for the wrapper.
    const wrapped = 'value' in v && isPlainObject(v.value) && !('value' in childFields);
    const inner = (wrapped ? v.value : v) as Record<string, unknown>;

    for (const [key, subField] of Object.entries(childFields)) {
        const subValue = inner[key];
        const subPath = `${path}.${key}`;
        if (isMissingValue(subValue)) {
            if (isFieldRequired(subField)) {
                issues.push({
                    type: 'error',
                    code: 'OBJECT_MISSING_REQUIRED_FIELD',
                    message: `Required field "${key}" is missing.`,
                    path: subPath
                });
            }
            continue;
        }
        issues.push(...validateFieldValue(subValue, subField, subPath, context));
    }

    return issues;
}
