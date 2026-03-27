import { BlockSchema } from '@moteurio/types/Block.js';
import { ValidationResult } from '@moteurio/types/ValidationResult.js';
import { createValidationResult, addIssue } from '../utils/validation.js';
import { validateFieldValue } from './validateFieldValue.js';
import fieldRegistry from '../registry/FieldRegistry.js';
import type { Field } from '@moteurio/types/Field.js';

export function validateBlock(blockInstance: any, blockSchema: BlockSchema): ValidationResult {
    const result = createValidationResult();

    const data = blockInstance?.data || {};
    const schemaFields = blockSchema?.fields || {};

    for (const fieldName of Object.keys(schemaFields)) {
        const fieldDef = schemaFields[fieldName] as Field;
        const fieldValue = data[fieldName];
        const fieldPath = `data.${fieldName}`;

        if (fieldValue === undefined || fieldValue === null) {
            const isRequired = fieldDef.required === true;
            addIssue(result, {
                type: isRequired ? 'error' : 'warning',
                code: isRequired ? 'BLOCK_FIELD_REQUIRED' : 'BLOCK_FIELD_MISSING',
                message: isRequired
                    ? `Required field "${fieldName}" is missing.`
                    : `Optional field "${fieldName}" has no value.`,
                path: fieldPath
            });
            continue;
        }

        const fieldType = fieldDef.type;
        if (!fieldRegistry.get(fieldType)) {
            addIssue(result, {
                type: 'error',
                code: 'BLOCK_FIELD_TYPE_UNKNOWN',
                message: `Unknown field type "${fieldType}" used in field "${fieldName}".`,
                path: fieldPath
            });
            continue;
        }

        const issues = validateFieldValue(fieldValue, fieldDef, fieldPath);
        for (const issue of issues) {
            addIssue(result, issue);
        }
    }

    for (const key of Object.keys(data)) {
        if (!schemaFields[key]) {
            addIssue(result, {
                type: 'warning',
                code: 'BLOCK_FIELD_UNEXPECTED',
                message: `Unexpected field "${key}" not defined in block schema.`,
                path: `data.${key}`
            });
        }
    }

    return result;
}
