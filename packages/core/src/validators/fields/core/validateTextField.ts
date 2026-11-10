import { Field } from '@moteurio/types/Field.js';
import { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import safeRegex from 'safe-regex';
import { isLikelyLocaleStringMap, isPlainObject } from '../../fieldValueUtils.js';

/** The property name that holds the string or locale map for this field type. It matches `fields` in the registry. */
function textSubKey(field: Field): string {
    const t = field.type;
    if (t === 'core/url') return 'url';
    if (t === 'core/text' || t === 'core/textarea') return 'text';
    return 'value';
}

/**
 * Collects the string segments to validate from a plain string, `{ text: ... }`, `{ url: ... }`,
 * `{ value: ... }`, or a locale map.
 */
function collectTextSegments(
    value: unknown,
    field: Field
): { pathSuffix: string; text: string }[] | 'invalid' {
    if (typeof value === 'string') {
        return [{ pathSuffix: '', text: value }];
    }

    if (!isPlainObject(value)) {
        return 'invalid';
    }

    const key = textSubKey(field);
    const nested = value[key];

    if (typeof nested === 'string') {
        return [{ pathSuffix: `.${key}`, text: nested }];
    }

    if (isPlainObject(nested) && isLikelyLocaleStringMap(nested)) {
        return Object.entries(nested).map(([loc, text]) => ({
            pathSuffix: `.${key}.${loc}`,
            text
        }));
    }

    if (isLikelyLocaleStringMap(value)) {
        return Object.entries(value).map(([loc, text]) => ({
            pathSuffix: `.${loc}`,
            text
        }));
    }

    return 'invalid';
}

export function validateTextField(value: any, field: Field, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const segments = collectTextSegments(value, field);

    if (segments === 'invalid') {
        issues.push({
            type: 'error',
            code: 'TEXT_INVALID_TYPE',
            message:
                'Expected a string, locale map of strings, or wrapped field object (e.g. { text }, { url }, { value }).',
            path,
            context: { value }
        });
        return issues;
    }

    const opts = field.options || {};

    let patternRe: RegExp | undefined;
    if (opts.pattern) {
        const patternStr = String(opts.pattern);
        try {
            patternRe = new RegExp(patternStr);
        } catch {
            issues.push({
                type: 'error',
                code: 'TEXT_PATTERN_INVALID',
                message: 'Field pattern is not a valid regular expression.',
                path,
                context: { pattern: patternStr }
            });
        }
        if (patternRe && !safeRegex(patternRe)) {
            issues.push({
                type: 'error',
                code: 'TEXT_PATTERN_INVALID',
                message:
                    'Field pattern is not allowed: it may cause excessive matching cost (unsafe regular expression).',
                path,
                context: { pattern: patternStr }
            });
            patternRe = undefined;
        }
    }

    for (const { pathSuffix, text } of segments) {
        const p = `${path}${pathSuffix}`;

        if (opts.minLength != null && text.length < opts.minLength) {
            issues.push({
                type: 'error',
                code: 'TEXT_TOO_SHORT',
                message: `Value is too short (min ${opts.minLength} chars).`,
                path: p,
                context: { value: text }
            });
        }
        if (opts.maxLength != null && text.length > opts.maxLength) {
            issues.push({
                type: 'error',
                code: 'TEXT_TOO_LONG',
                message: `Value is too long (max ${opts.maxLength} chars).`,
                path: p,
                context: { value: text }
            });
        }
        if (patternRe && !patternRe.test(text)) {
            issues.push({
                type: 'error',
                code: 'TEXT_PATTERN_MISMATCH',
                message: `Value does not match pattern: ${String(opts.pattern)}`,
                path: p,
                context: { value: text }
            });
        }
    }

    return issues;
}
