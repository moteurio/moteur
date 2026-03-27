import type { Field } from '@moteurio/types/Field.js';
import type { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import { isLikelyLocaleStringMap, isPlainObject } from '../../fieldValueUtils.js';

function optionalStringOrMap(v: unknown, path: string, label: string): ValidationIssue[] {
    if (v === undefined) return [];
    if (typeof v === 'string') return [];
    if (isLikelyLocaleStringMap(v)) return [];
    return [
        {
            type: 'warning',
            code: 'ASSET_INVALID_OPTIONAL',
            message: `"${label}" should be a string or locale map of strings.`,
            path,
            context: { value: v }
        }
    ];
}

export function validateAssetField(value: any, field: Field, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (value === null || value === undefined) {
        issues.push({
            type: 'error',
            code: 'ASSET_INVALID_TYPE',
            message: 'Expected an asset object with assetId.',
            path,
            context: { value }
        });
        return issues;
    }

    if (!isPlainObject(value)) {
        issues.push({
            type: 'error',
            code: 'ASSET_INVALID_TYPE',
            message: 'Expected an object with assetId.',
            path,
            context: { value }
        });
        return issues;
    }

    if (typeof value.assetId !== 'string' || !value.assetId.trim()) {
        issues.push({
            type: 'error',
            code: 'ASSET_MISSING_ID',
            message: 'assetId must be a non-empty string.',
            path: `${path}.assetId`,
            context: { assetId: value.assetId }
        });
    }

    issues.push(...optionalStringOrMap(value.alt, `${path}.alt`, 'alt'));
    issues.push(...optionalStringOrMap(value.caption, `${path}.caption`, 'caption'));

    return issues;
}
