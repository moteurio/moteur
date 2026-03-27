import { Field } from '@moteurio/types/Field.js';
import { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import { isLikelyLocaleStringMap } from '../../fieldValueUtils.js';

function isNonEmptyString(v: unknown): v is string {
    return typeof v === 'string' && v.trim().length > 0;
}

function validateSrc(src: unknown, path: string): ValidationIssue[] {
    if (isNonEmptyString(src)) {
        return [];
    }
    if (isLikelyLocaleStringMap(src)) {
        const issues: ValidationIssue[] = [];
        for (const [loc, s] of Object.entries(src)) {
            if (!isNonEmptyString(s)) {
                issues.push({
                    type: 'error',
                    code: 'IMAGE_MISSING_SRC',
                    message: `Image "src" must be a non-empty string for locale "${loc}".`,
                    path: `${path}.src.${loc}`,
                    context: { src: s }
                });
            }
        }
        if (issues.length === 0 && Object.keys(src).length === 0) {
            issues.push({
                type: 'error',
                code: 'IMAGE_MISSING_SRC',
                message: 'Image must have a non-empty "src".',
                path: `${path}.src`,
                context: { src }
            });
        }
        return issues;
    }
    return [
        {
            type: 'error',
            code: 'IMAGE_MISSING_SRC',
            message: 'Image must have a non-empty "src" string or locale map of strings.',
            path: `${path}.src`,
            context: { src }
        }
    ];
}

function validateAltOptional(alt: unknown, path: string): ValidationIssue[] {
    if (alt === undefined) {
        return [];
    }
    if (typeof alt === 'string') {
        return [];
    }
    if (isLikelyLocaleStringMap(alt)) {
        return [];
    }
    return [
        {
            type: 'warning',
            code: 'IMAGE_INVALID_ALT',
            message: 'Image "alt" should be a string or locale map of strings.',
            path,
            context: { alt }
        }
    ];
}

export function validateImageField(value: any, field: Field, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        issues.push({
            type: 'error',
            code: 'IMAGE_INVALID_TYPE',
            message: 'Expected an object with image properties (src, alt, etc.).',
            path,
            context: { value }
        });
        return issues;
    }

    issues.push(...validateSrc(value.src, path));
    issues.push(...validateAltOptional(value.alt, `${path}.alt`));

    return issues;
}
