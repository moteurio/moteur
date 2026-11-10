import type { Field, FieldValidationContext } from '@moteurio/types/Field.js';
import type { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import { isPlainObject } from '../../fieldValueUtils.js';
import { validateFieldValue } from '../../validateFieldValue.js';

/** Returns the field definition of the values in a map. It defaults to a text field when the map does not define one. */
export function mapValueField(field: Field): Field {
    const value = field.options?.value as Field | undefined;
    return value && typeof value === 'object' && typeof value.type === 'string'
        ? value
        : ({ type: 'core/text', label: 'Value' } as Field);
}

/** Returns the keys a map may have, or undefined when any key is allowed. */
export function mapKeys(field: Field): string[] | undefined {
    const keys = field.options?.keys;
    if (!Array.isArray(keys) || !keys.length) return undefined;
    return keys
        .map(k => (typeof k === 'string' ? k : (k as { value?: unknown })?.value))
        .filter((k): k is string => typeof k === 'string');
}

export function validateMapField(
    value: unknown,
    field: Field,
    path: string,
    context?: FieldValidationContext
): ValidationIssue[] {
    if (!isPlainObject(value))
        return [
            {
                type: 'error',
                code: 'MAP_INVALID_TYPE',
                message: 'Expected an object of keys to values.',
                path,
                context: { value }
            }
        ];
    const issues: ValidationIssue[] = [];
    const allowed = mapKeys(field);
    const valueField = mapValueField(field);
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
        if (!key.trim()) {
            issues.push({
                type: 'error',
                code: 'MAP_EMPTY_KEY',
                message: 'A key can’t be empty.',
                path
            });
            continue;
        }
        if (allowed && !allowed.includes(key)) {
            issues.push({
                type: 'error',
                code: 'MAP_UNKNOWN_KEY',
                message: `"${key}" is not one of its keys (${allowed.join(', ')}).`,
                path: `${path}.${key}`
            });
            continue;
        }
        issues.push(...validateFieldValue(v, valueField, `${path}.${key}`, context));
    }
    return issues;
}
