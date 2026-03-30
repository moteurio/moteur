import { validateFieldValue } from './validateFieldValue.js';
import { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import type { Field, FieldValidationContext } from '@moteurio/types/Field.js';

function isFieldRequired(fieldSchema: Field): boolean {
    return fieldSchema.required === true || fieldSchema.options?.required === true;
}

export interface ValidateFieldsAgainstSchemaOptions {
    projectId?: string;
    allowHtmlIframe?: boolean;
    allowHtmlEmbed?: boolean;
}

function fieldValidationContext(
    options?: ValidateFieldsAgainstSchemaOptions
): FieldValidationContext {
    return {
        projectId: options?.projectId,
        allowHtmlIframe: options?.allowHtmlIframe === true,
        allowHtmlEmbed: options?.allowHtmlEmbed === true
    };
}

/**
 * Validates a set of field values against their schema definitions.
 * Shared logic used by both validateEntry and validatePage.
 */
export function validateFieldsAgainstSchema(
    data: Record<string, unknown> | undefined,
    schemaFields: Record<string, Field>,
    pathPrefix: string,
    missingFieldCode: string,
    options?: ValidateFieldsAgainstSchemaOptions
): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const [fieldKey, fieldSchema] of Object.entries(schemaFields)) {
        const value = data?.[fieldKey];
        const path = `${pathPrefix}.${fieldKey}`;

        if (
            isFieldRequired(fieldSchema) &&
            (value === undefined || value === null || value === '')
        ) {
            issues.push({
                type: 'error',
                code: missingFieldCode,
                message: `Required field "${fieldKey}" is missing.`,
                path,
                hint: 'Provide a value for this field.'
            });
            continue;
        }

        if (value !== undefined) {
            const fieldValidation = validateFieldValue(
                value,
                fieldSchema,
                path,
                fieldValidationContext(options)
            );
            issues.push(...fieldValidation);
        }
    }

    return issues;
}
