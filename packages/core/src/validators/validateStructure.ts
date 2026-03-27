import { StructureSchema } from '@moteurio/types/Structure.js';
import { ValidationResult } from '@moteurio/types/ValidationResult.js';
import { createValidationResult, addIssue } from '../utils/validation.js';
import fieldRegistry from '../registry/FieldRegistry.js';

export function validateStructure(structure: StructureSchema): ValidationResult {
    const result = createValidationResult();

    if (!structure.type || typeof structure.type !== 'string') {
        addIssue(result, {
            type: 'error',
            code: 'INVALID_STRUCTURE_TYPE',
            message: 'Structure is missing a valid "type" string.',
            path: 'type'
        });
    }

    if (!structure.label || typeof structure.label !== 'string') {
        addIssue(result, {
            type: 'warning',
            code: 'STRUCTURE_MISSING_LABEL',
            message: 'Structure should have a human-readable "label".',
            path: 'label'
        });
    }

    const fields = structure.fields || {};

    if (Object.keys(fields).length === 0) {
        addIssue(result, {
            type: 'warning',
            code: 'STRUCTURE_EMPTY_FIELDS',
            message: 'Structure has no defined fields.',
            path: 'fields'
        });
    }

    for (const [fieldName, fieldDef] of Object.entries(fields)) {
        const fieldType = fieldDef.type;
        const fieldPath = `fields.${fieldName}`;

        if (!fieldType || typeof fieldType !== 'string') {
            addIssue(result, {
                type: 'error',
                code: 'STRUCTURE_FIELD_MISSING_TYPE',
                message: `Field "${fieldName}" is missing a valid "type".`,
                path: fieldPath
            });
            continue;
        }

        if (!fieldRegistry.get(fieldType)) {
            addIssue(result, {
                type: 'error',
                code: 'STRUCTURE_FIELD_UNKNOWN_TYPE',
                message: `Field "${fieldName}" uses unknown field type "${fieldType}".`,
                path: fieldPath
            });
        }
    }

    return result;
}
