import type { Field, FieldValidationContext } from '@moteurio/types/Field.js';
import { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import { isPlainObject } from '../../fieldValueUtils.js';
import { validateFieldValue } from '../../validateFieldValue.js';
import { isFieldRequired, isMissingValue } from '../../validateFieldsAgainstSchema.js';

/** One shape a variant field can take. */
export type VariantDefinition = {
    label?: string | Record<string, string>;
    description?: string;
    fields?: Record<string, Field>;
};

const KIND_PATTERN = /^[a-z][a-z0-9-]*$/;

/** The variants a field declares, by kind, or null when `options.variants` is not an object. */
export function variantsOf(field: Field): Record<string, VariantDefinition> | null {
    const variants = field.options?.variants;
    return isPlainObject(variants) ? (variants as Record<string, VariantDefinition>) : null;
}

/** What is wrong with a field's variants, if anything: checked before any value. */
function configurationIssues(
    variants: Record<string, VariantDefinition> | null,
    field: Field,
    path: string
): ValidationIssue[] {
    if (!variants || Object.keys(variants).length === 0) {
        return [
            {
                type: 'error',
                code: 'VARIANT_MISSING_VARIANTS',
                message: 'A variant field needs at least one variant in "options.variants".',
                path
            }
        ];
    }
    const issues: ValidationIssue[] = [];
    for (const [kind, def] of Object.entries(variants)) {
        if (!KIND_PATTERN.test(kind)) {
            issues.push({
                type: 'error',
                code: 'VARIANT_INVALID_KIND',
                message: `Variant kind "${kind}" must be lowercase letters, digits and hyphens, starting with a letter.`,
                path
            });
        }
        if (!isPlainObject(def) || (def.fields !== undefined && !isPlainObject(def.fields))) {
            issues.push({
                type: 'error',
                code: 'VARIANT_INVALID_DEFINITION',
                message: `Variant "${kind}" must be an object whose "fields" is an object.`,
                path
            });
        } else if (def.fields && 'kind' in def.fields) {
            issues.push({
                type: 'error',
                code: 'VARIANT_RESERVED_FIELD',
                message: `Variant "${kind}" cannot have a field called "kind": it holds the variant's name.`,
                path
            });
        }
    }
    const fallback = field.options?.default;
    if (fallback !== undefined && !(fallback in variants)) {
        issues.push({
            type: 'error',
            code: 'VARIANT_UNKNOWN_DEFAULT',
            message: `Default kind "${fallback}" is not one of the variants.`,
            path
        });
    }
    return issues;
}

export function validateVariantField(
    value: any,
    field: Field,
    path: string,
    context?: FieldValidationContext
): ValidationIssue[] {
    const variants = variantsOf(field);
    const config = configurationIssues(variants, field, path);
    if (config.length > 0) return config;

    if (value === undefined || value === null) {
        if (field.options?.allowEmpty === true) return [];
        return [
            {
                type: 'error',
                code: 'VARIANT_EMPTY',
                message: 'A variant value is required.',
                path,
                context: { value }
            }
        ];
    }

    if (!isPlainObject(value)) {
        return [
            {
                type: 'error',
                code: 'VARIANT_INVALID_TYPE',
                message: 'A variant value must be an object with a "kind".',
                path,
                context: { value }
            }
        ];
    }

    const kind = value.kind;
    if (typeof kind !== 'string' || !(kind in variants!)) {
        return [
            {
                type: 'error',
                code: 'VARIANT_UNKNOWN_KIND',
                message: `"kind" must be one of: ${Object.keys(variants!).join(', ')}.`,
                path: `${path}.kind`,
                context: { kind }
            }
        ];
    }

    const issues: ValidationIssue[] = [];
    const fields = variants![kind].fields ?? {};
    for (const [key, subField] of Object.entries(fields)) {
        const subValue = value[key];
        const subPath = `${path}.${key}`;
        if (isMissingValue(subValue)) {
            if (isFieldRequired(subField)) {
                issues.push({
                    type: context?.requiredAsWarning ? 'warning' : 'error',
                    code: 'VARIANT_MISSING_REQUIRED_FIELD',
                    message: `Required field "${key}" is missing.`,
                    path: subPath
                });
            }
            continue;
        }
        issues.push(...validateFieldValue(subValue, subField, subPath, context));
    }
    // Left over from another kind, most often after switching: kept, but not part of this shape.
    for (const key of Object.keys(value)) {
        if (key === 'kind' || key in fields) continue;
        issues.push({
            type: 'warning',
            code: 'VARIANT_UNKNOWN_FIELD',
            message: `"${key}" is not a field of the "${kind}" variant.`,
            path: `${path}.${key}`
        });
    }
    return issues;
}
