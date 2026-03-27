import { Field } from '@moteurio/types/Field.js';
import { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import { isLikelyLocaleStringMap, isPlainObject } from '../../fieldValueUtils.js';

export function validateMarkdownField(value: any, field: Field, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (typeof value === 'string') {
        return issues;
    }

    if (isPlainObject(value) && isPlainObject(value.markdown)) {
        const md = value.markdown as Record<string, unknown>;
        for (const [locale, str] of Object.entries(md)) {
            if (typeof str !== 'string') {
                issues.push({
                    type: 'error',
                    code: 'MARKDOWN_INVALID_TYPE',
                    message: 'Each markdown locale value must be a string.',
                    path: `${path}.markdown.${locale}`,
                    context: { value: str }
                });
            }
        }
        return issues;
    }

    if (isLikelyLocaleStringMap(value)) {
        return issues;
    }

    issues.push({
        type: 'error',
        code: 'MARKDOWN_INVALID_TYPE',
        message: 'Expected a markdown string, locale map, or { markdown: Record<locale, string> }.',
        path,
        context: { value }
    });

    return issues;
}
