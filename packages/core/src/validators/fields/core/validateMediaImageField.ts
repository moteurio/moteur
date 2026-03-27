import type { Field } from '@moteurio/types/Field.js';
import type { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import { isLikelyLocaleStringMap, isPlainObject } from '../../fieldValueUtils.js';

function hasNonEmptySrc(src: unknown): boolean {
    if (typeof src === 'string' && src.trim() !== '') return true;
    if (isLikelyLocaleStringMap(src)) {
        return Object.values(src).some(s => typeof s === 'string' && s.trim() !== '');
    }
    return false;
}

export function validateMediaImageField(value: any, field: Field, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (!isPlainObject(value)) {
        issues.push({
            type: 'error',
            code: 'MEDIA_IMAGE_INVALID_TYPE',
            message: 'Expected an object with "src".',
            path,
            context: { value }
        });
        return issues;
    }

    if (!hasNonEmptySrc(value.src)) {
        issues.push({
            type: 'error',
            code: 'MEDIA_IMAGE_MISSING_SRC',
            message: 'Image "src" must be a non-empty string or locale map of strings.',
            path: `${path}.src`,
            context: { src: value.src }
        });
    }

    return issues;
}
