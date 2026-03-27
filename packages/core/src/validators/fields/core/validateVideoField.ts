import type { Field } from '@moteurio/types/Field.js';
import type { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import { isLikelyLocaleStringMap, isPlainObject } from '../../fieldValueUtils.js';

function hasLocalizedOrPlainString(v: unknown): boolean {
    if (typeof v === 'string' && v.trim() !== '') return true;
    if (isLikelyLocaleStringMap(v)) {
        return Object.values(v).some(s => typeof s === 'string' && s.trim() !== '');
    }
    return false;
}

export function validateVideoField(value: any, field: Field, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (value === null || value === undefined) {
        return issues;
    }

    if (!isPlainObject(value)) {
        issues.push({
            type: 'error',
            code: 'VIDEO_INVALID_TYPE',
            message: 'Expected a video object (provider, target, …).',
            path,
            context: { value }
        });
        return issues;
    }

    if (!hasLocalizedOrPlainString(value.provider)) {
        issues.push({
            type: 'error',
            code: 'VIDEO_MISSING_PROVIDER',
            message: 'Video "provider" is required (string or locale map).',
            path: `${path}.provider`,
            context: { provider: value.provider }
        });
    }

    if (!hasLocalizedOrPlainString(value.target)) {
        issues.push({
            type: 'error',
            code: 'VIDEO_MISSING_TARGET',
            message: 'Video "target" (id) is required (string or locale map).',
            path: `${path}.target`,
            context: { target: value.target }
        });
    }

    return issues;
}
