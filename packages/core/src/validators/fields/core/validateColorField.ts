import { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import { Field } from '@moteurio/types/Field.js';

export function validateColorField(value: any, field: Field, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (typeof value !== 'string') {
        issues.push({
            type: 'error',
            code: 'COLOR_INVALID_TYPE',
            message: 'Color must be a string (e.g., "#ff0000").',
            path,
            context: { value }
        });
        return issues;
    }

    const allowAlpha = field.options?.allowAlpha ?? false;
    const hexRegex = allowAlpha
        ? /^#(?:[0-9a-fA-F]{4}|[0-9a-fA-F]{8}|[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
        : /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

    if (!hexRegex.test(value)) {
        issues.push({
            type: 'error',
            code: 'COLOR_INVALID_FORMAT',
            message: `Invalid color format. Expected ${allowAlpha ? '3/4/6/8-digit hex' : '3/6-digit hex'}.`,
            path,
            context: { value }
        });
    }

    if (field.options?.presetColors && !field.options.allowCustom) {
        const allowed = field.options.presetColors;
        if (!allowed.includes(value)) {
            issues.push({
                type: 'error',
                code: 'COLOR_INVALID_PRESET',
                message: `Color must be one of the preset colors.`,
                path,
                context: { allowed, value }
            });
        }
    }

    return issues;
}
