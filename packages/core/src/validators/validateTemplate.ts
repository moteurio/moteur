import { TemplateSchema } from '@moteurio/types/Template.js';
import { ValidationResult } from '@moteurio/types/ValidationResult.js';
import { createValidationResult, addIssue } from '../utils/validation.js';

export function validateTemplate(template: TemplateSchema): ValidationResult {
    const result = createValidationResult();

    if (!template.id || typeof template.id !== 'string') {
        addIssue(result, {
            type: 'error',
            code: 'TEMPLATE_INVALID_ID',
            message: 'Template "id" must be a non-empty string.',
            path: 'id'
        });
    }

    if (!template.label || typeof template.label !== 'string') {
        addIssue(result, {
            type: 'error',
            code: 'TEMPLATE_INVALID_LABEL',
            message: 'Template "label" must be a non-empty string.',
            path: 'label'
        });
    }

    if (template.description !== undefined && typeof template.description !== 'string') {
        addIssue(result, {
            type: 'error',
            code: 'TEMPLATE_INVALID_DESCRIPTION',
            message: 'Template "description" must be a string if provided.',
            path: 'description'
        });
    }

    if (!template.fields || typeof template.fields !== 'object' || Array.isArray(template.fields)) {
        addIssue(result, {
            type: 'error',
            code: 'TEMPLATE_INVALID_FIELDS',
            message:
                'Template "fields" must be an object mapping field names to Field definitions.',
            path: 'fields'
        });
    } else {
        Object.entries(template.fields).forEach(([fieldName, fieldDef]) => {
            if (!fieldDef || typeof fieldDef !== 'object' || !fieldDef.type) {
                addIssue(result, {
                    type: 'error',
                    code: 'TEMPLATE_INVALID_FIELD',
                    message: `Field "${fieldName}" must be a valid Field definition with a "type" property.`,
                    path: `fields.${fieldName}`
                });
            }
        });
    }

    return result;
}
