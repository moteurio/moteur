import type { Field, FieldValidationContext } from '@moteurio/types/Field.js';
import { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import fieldRegistry from '../registry/FieldRegistry.js';

export function validateFieldValue(
    value: any,
    field: Field,
    path: string,
    context?: FieldValidationContext
): ValidationIssue[] {
    if (!fieldRegistry.has(field.type)) {
        return [
            {
                type: 'warning',
                code: 'NO_FIELD_VALIDATOR',
                message: `No validator available for field type "${field.type}".`,
                path,
                context: { value }
            }
        ];
    }

    const schema = fieldRegistry.get(field.type);

    if (!schema.validate) {
        return [];
    }

    const resolved =
        schema.resolveValue === false ? value : schema.storeDirect !== false ? value : value?.value;

    // An optional field may be empty whatever its type. `allowEmpty` only matters for a required
    // field.
    if (!isRequired(field) && isEmptyValue(resolved)) return [];

    return schema.validate(resolved, field, path, context);
}

function isRequired(field: Field): boolean {
    return field.required === true || field.options?.required === true;
}

/** Whether a value is empty: undefined, null, '', [], {}, or a list's `{ items: [] }`. */
export function isEmptyValue(value: unknown): boolean {
    if (value === undefined || value === null || value === '') return true;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') {
        const keys = Object.keys(value as object);
        if (keys.length === 0) return true;
        const items = (value as { items?: unknown }).items;
        return keys.length === 1 && Array.isArray(items) && items.length === 0;
    }
    return false;
}
