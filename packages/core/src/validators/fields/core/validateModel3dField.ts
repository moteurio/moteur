import type { Field } from '@moteurio/types/Field.js';
import type { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import { isLikelyLocaleStringMap, isPlainObject } from '../../fieldValueUtils.js';

function hasUrl(v: unknown): boolean {
    if (typeof v === 'string' && v.trim() !== '') return true;
    if (isLikelyLocaleStringMap(v)) {
        return Object.values(v).some(s => typeof s === 'string' && s.trim() !== '');
    }
    return false;
}

export function validateModel3dField(value: any, field: Field, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (value === null || value === undefined) {
        return issues;
    }

    if (!isPlainObject(value)) {
        issues.push({
            type: 'error',
            code: 'MODEL_3D_INVALID_TYPE',
            message: 'Expected a 3D model object with src (URL).',
            path,
            context: { value }
        });
        return issues;
    }

    if (!hasUrl(value.src)) {
        issues.push({
            type: 'error',
            code: 'MODEL_3D_MISSING_SRC',
            message: '3D model "src" URL is required (string or locale map).',
            path: `${path}.src`,
            context: { src: value.src }
        });
    }

    return issues;
}
