import { Field } from '@moteurio/types/Field.js';
import { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import { isPlainObject } from '../../fieldValueUtils.js';
import { validateFieldValue } from '../../validateFieldValue.js';

export function validateObjectField(value: any, field: Field, path: string): ValidationIssue[] {
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
    let inner: Record<string, unknown>;
    if ('value' in v && isPlainObject(v.value) && !Array.isArray(v.value)) {
        inner = v.value as Record<string, unknown>;
    } else {
        inner = v;
    }

    const childFields =
        (field.data as Record<string, Field> | undefined) ??
        ((field as Field & { fields?: Record<string, Field> }).fields as
            | Record<string, Field>
            | undefined) ??
        ((field as Field & { properties?: Record<string, Field> }).properties as
            | Record<string, Field>
            | undefined) ??
        {};

    for (const [key, subField] of Object.entries(childFields)) {
        const subValue = inner[key];
        const subPath = `${path}.${key}`;
        issues.push(...validateFieldValue(subValue, subField, subPath));
    }

    return issues;
}
