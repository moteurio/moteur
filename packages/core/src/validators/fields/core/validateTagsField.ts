import { Field } from '@moteurio/types/Field.js';
import { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import { isPlainObject } from '../../fieldValueUtils.js';

export function validateTagsField(value: any, field: Field, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    const opts = field.options || {};

    let arr: unknown = value;
    if (Array.isArray(value)) {
        arr = value;
    } else if (isPlainObject(value) && Array.isArray(value.value)) {
        arr = value.value;
    } else if (isPlainObject(value) && Array.isArray(value.items)) {
        arr = value.items;
    }

    if (!Array.isArray(arr)) {
        const noun = field.type === 'core/categories' ? 'category IDs' : 'tag IDs';
        issues.push({
            type: 'error',
            code: 'TAGS_INVALID_TYPE',
            message: `Expected an array of ${noun}, { value: string[] }, or { items: string[] }.`,
            path,
            context: { value }
        });
        return issues;
    }

    if (opts.maxTags !== undefined && arr.length > opts.maxTags) {
        issues.push({
            type: 'error',
            code: 'TAGS_TOO_MANY',
            message: `Too many tags (max ${opts.maxTags}).`,
            path,
            context: { value: arr, max: opts.maxTags }
        });
    }

    arr.forEach((tag, index) => {
        if (typeof tag !== 'string') {
            issues.push({
                type: 'error',
                code: 'TAG_INVALID_TYPE',
                message: 'Each tag must be a string.',
                path: `${path}[${index}]`,
                context: { tag }
            });
        }
    });

    if (!opts.source || typeof opts.source !== 'string') {
        issues.push({
            type: 'error',
            code: 'TAGS_MISSING_SOURCE',
            message: 'Tag field must have a valid "source" defined in options.',
            path,
            context: { options: opts }
        });
    }

    return issues;
}
