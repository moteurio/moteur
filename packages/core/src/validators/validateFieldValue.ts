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

    return schema.validate(resolved, field, path, context);
}
