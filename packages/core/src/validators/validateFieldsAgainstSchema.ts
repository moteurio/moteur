import { validateFieldValue } from './validateFieldValue.js';
import { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import type { Field, FieldValidationContext } from '@moteurio/types/Field.js';
import type { StructureSchema } from '@moteurio/types/Structure.js';

export function isFieldRequired(fieldSchema: Field): boolean {
    return fieldSchema.required === true || fieldSchema.options?.required === true;
}

/** Whether a value counts as missing for a required field. */
export function isMissingValue(value: unknown): boolean {
    return value === undefined || value === null || value === '';
}

export interface ValidateFieldsAgainstSchemaOptions {
    projectId?: string;
    allowHtmlIframe?: boolean;
    allowHtmlEmbed?: boolean;
    /** The project's structures, which core/structure fields use to look up their schema (see FieldValidationContext). */
    structures?: Record<string, StructureSchema>;
    /**
     * Report missing required fields as warnings. Drafts may be incomplete, and the requirement is
     * enforced when the entry goes to review or live.
     */
    requiredAsWarning?: boolean;
}

function fieldValidationContext(
    options?: ValidateFieldsAgainstSchemaOptions
): FieldValidationContext {
    return {
        projectId: options?.projectId,
        allowHtmlIframe: options?.allowHtmlIframe === true,
        allowHtmlEmbed: options?.allowHtmlEmbed === true,
        structures: options?.structures,
        requiredAsWarning: options?.requiredAsWarning === true
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

        if (isFieldRequired(fieldSchema) && isMissingValue(value)) {
            issues.push({
                type: options?.requiredAsWarning ? 'warning' : 'error',
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

/**
 * Reports values for fields the schema does not define (for example `kicker` on a block that has
 * no kicker field). Such values are stored but never delivered, so a typo or a renamed field would
 * otherwise go unnoticed. When content is saved this is a warning, so data from before a field was
 * removed stays editable. An import rejects these values (FIELD_UNKNOWN).
 */
export function unknownFieldIssues(
    data: unknown,
    schemaFields: Record<string, Field>,
    pathPrefix: string,
    owner: string
): ValidationIssue[] {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
    return Object.keys(data)
        .filter(key => !(key in schemaFields))
        .map(key => ({
            type: 'warning' as const,
            code: 'FIELD_UNKNOWN',
            message: `"${key}" is not a field of ${owner}.`,
            path: `${pathPrefix}.${key}`
        }));
}
