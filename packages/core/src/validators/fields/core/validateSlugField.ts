import { Field } from '@moteurio/types/Field.js';
import { ValidationIssue } from '@moteurio/types/ValidationResult.js';

export function validateSlugField(value: any, field: Field, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const isMultilingual = field.options?.multilingual === true;

    if (value === undefined || value === null || value === '') {
        return issues;
    }

    if (isMultilingual) {
        if (typeof value !== 'object' || Array.isArray(value)) {
            issues.push({
                type: 'error',
                code: 'SLUG_INVALID_MULTILINGUAL_FORMAT',
                message: 'Expected an object with locale keys for a multilingual slug.',
                path,
                context: { value }
            });
            return issues;
        }

        for (const [locale, slug] of Object.entries(value)) {
            if (typeof slug !== 'string' || slug.trim() === '') {
                issues.push({
                    type: 'error',
                    code: 'SLUG_INVALID_VALUE',
                    message: `Slug for locale "${locale}" must be a non-empty string.`,
                    path: `${path}.${locale}`,
                    context: { slug }
                });
            } else if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
                issues.push({
                    type: 'error',
                    code: 'SLUG_INVALID_FORMAT',
                    message: `Slug for locale "${locale}" contains invalid characters.`,
                    path: `${path}.${locale}`,
                    context: { slug }
                });
            }
        }
    } else {
        if (typeof value !== 'string' || value.trim() === '') {
            issues.push({
                type: 'error',
                code: 'SLUG_INVALID_VALUE',
                message: 'Slug must be a non-empty string.',
                path,
                context: { value }
            });
        } else if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
            issues.push({
                type: 'error',
                code: 'SLUG_INVALID_FORMAT',
                message:
                    'Slug contains invalid characters. Only letters, numbers, "-" and "_" are allowed.',
                path,
                context: { value }
            });
        }
    }

    return issues;
}
