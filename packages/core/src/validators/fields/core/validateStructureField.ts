import type { Field, FieldValidationContext } from '@moteurio/types/Field.js';
import { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import { isPlainObject } from '../../fieldValueUtils.js';
import * as structures from '../../../structures.js';
import { validateFieldValue } from '../../validateFieldValue.js';

function resolveStructureContent(value: unknown): Record<string, unknown> | null {
    if (!isPlainObject(value)) {
        return null;
    }
    if ('content' in value) {
        if (!isPlainObject(value.content) || Array.isArray(value.content)) {
            return null;
        }
        return value.content as Record<string, unknown>;
    }
    if ('value' in value && isPlainObject(value.value) && !Array.isArray(value.value)) {
        return value.value as Record<string, unknown>;
    }
    return value as Record<string, unknown>;
}

export function validateStructureField(
    value: any,
    field: Field,
    path: string,
    context?: FieldValidationContext
): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    const structureId = field.options?.structure;
    const inlineSchema = field.options?.inlineSchema;

    if (structureId && inlineSchema) {
        issues.push({
            type: 'error',
            code: 'STRUCTURE_INVALID_CONFIGURATION',
            message: 'Cannot define both "structure" and "inlineSchema". Choose one.',
            path
        });
        return issues;
    }

    let schemaFields: Record<string, any> | undefined;
    if (structureId) {
        try {
            const sharedSchema = structures.getStructureFromCore(structureId);
            schemaFields = sharedSchema.fields;
        } catch (_error) {
            issues.push({
                type: 'error',
                code: 'STRUCTURE_SCHEMA_NOT_FOUND',
                message: `Shared structure schema "${structureId}" not found.`,
                path
            });
            return issues;
        }
    } else if (inlineSchema) {
        schemaFields = inlineSchema.fields;
    } else {
        issues.push({
            type: 'error',
            code: 'STRUCTURE_MISSING_SCHEMA',
            message: 'Either "structure" or "inlineSchema" must be defined in field.options.',
            path
        });
        return issues;
    }

    const contentValue = resolveStructureContent(value);
    if (!contentValue || typeof contentValue !== 'object' || Array.isArray(contentValue)) {
        issues.push({
            type: 'error',
            code: 'STRUCTURE_INVALID_CONTENT',
            message:
                'Structure payload must be an object (use "content", "value", or a flat object).',
            path
        });
        return issues;
    }

    if (!schemaFields) {
        issues.push({
            type: 'error',
            code: 'STRUCTURE_MISSING_FIELDS',
            message: 'Structure schema fields are missing.',
            path
        });
        return issues;
    }

    for (const [subKey, subField] of Object.entries(schemaFields)) {
        const subValue = contentValue[subKey];
        const subIssues = validateFieldValue(subValue, subField, `${path}.${subKey}`, context);
        issues.push(...subIssues);
    }

    return issues;
}
