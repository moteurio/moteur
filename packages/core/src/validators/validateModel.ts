import { ModelSchema } from '@moteurio/types/Model.js';
import { ValidationResult } from '@moteurio/types/ValidationResult.js';
import { createValidationResult, addIssue } from '../utils/validation.js';

export function validateModel(model: ModelSchema): ValidationResult {
    const result = createValidationResult();

    // id: required, string
    if (!model.id || typeof model.id !== 'string') {
        addIssue(result, {
            type: 'error',
            code: 'MODEL_INVALID_ID',
            message: 'Model "id" must be a non-empty string.',
            path: 'id'
        });
    }

    // label: required, string
    if (!model.label || typeof model.label !== 'string') {
        addIssue(result, {
            type: 'error',
            code: 'MODEL_INVALID_LABEL',
            message: 'Model "label" must be a non-empty string.',
            path: 'label'
        });
    }

    // description: optional, string
    if (model.description !== undefined && typeof model.description !== 'string') {
        addIssue(result, {
            type: 'error',
            code: 'MODEL_INVALID_DESCRIPTION',
            message: 'Model "description" must be a string if provided.',
            path: 'description'
        });
    }

    // fields: required, must be an object with Field entries
    if (!model.fields || typeof model.fields !== 'object' || Array.isArray(model.fields)) {
        addIssue(result, {
            type: 'error',
            code: 'MODEL_INVALID_FIELDS',
            message: 'Model "fields" must be an object mapping field names to Field definitions.',
            path: 'fields'
        });
    } else {
        // Validate each field (basic: check type is present)
        Object.entries(model.fields).forEach(([fieldName, fieldDef]) => {
            if (!fieldDef || typeof fieldDef !== 'object' || !fieldDef.type) {
                addIssue(result, {
                    type: 'error',
                    code: 'MODEL_INVALID_FIELD',
                    message: `Field "${fieldName}" must be a valid Field definition with a "type" property.`,
                    path: `fields.${fieldName}`
                });
            }
        });
    }

    // modelType: optional, must be one of allowed values if provided
    const allowedTypes = ['content', 'userData', 'taxonomy', 'settings'];
    if (model.modelType !== undefined) {
        if (typeof model.modelType !== 'string' || !allowedTypes.includes(model.modelType)) {
            addIssue(result, {
                type: 'error',
                code: 'MODEL_INVALID_TYPE',
                message: `Model "modelType" must be one of: ${allowedTypes.join(', ')}.`,
                path: 'modelType'
            });
        }
    }

    // optionsSchema: optional, object
    if (model.optionsSchema !== undefined && typeof model.optionsSchema !== 'object') {
        addIssue(result, {
            type: 'error',
            code: 'MODEL_INVALID_OPTIONS_SCHEMA',
            message: 'Model "optionsSchema" must be an object if provided.',
            path: 'optionsSchema'
        });
    }

    return result;
}
