import { Field } from '@moteurio/types/Field.js';
import { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import { isLikelyLocaleStringMap, isPlainObject } from '../../fieldValueUtils.js';

function allowedChoices(field: Field): string[] {
    const opts = field.options || {};
    const choices = Array.isArray(opts) ? opts : (opts?.choices ?? opts?.values);
    if (!Array.isArray(choices) || choices.length === 0) {
        return [];
    }
    return choices.map((c: any) => (typeof c === 'string' ? c : c?.value)).filter(Boolean);
}

function collectSelectStrings(value: unknown): { suffix: string; str: string }[] | 'invalid' {
    if (typeof value === 'string') {
        return [{ suffix: '', str: value }];
    }
    if (!isPlainObject(value)) {
        return 'invalid';
    }
    if (typeof value.value === 'string') {
        return [{ suffix: '.value', str: value.value }];
    }
    if (isPlainObject(value.value) && isLikelyLocaleStringMap(value.value)) {
        return Object.entries(value.value).map(([loc, str]) => ({
            suffix: `.value.${loc}`,
            str
        }));
    }
    if (isLikelyLocaleStringMap(value)) {
        return Object.entries(value).map(([loc, str]) => ({ suffix: `.${loc}`, str }));
    }
    return 'invalid';
}

export function validateSelectField(value: any, field: Field, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    const segments = collectSelectStrings(value);
    if (segments === 'invalid') {
        issues.push({
            type: 'error',
            code: 'SELECT_INVALID_TYPE',
            message: 'Expected a string, locale map, or { value: string | locale map }.',
            path,
            context: { value }
        });
        return issues;
    }

    const allowEmpty = field.options?.allowEmpty === true;
    const allowed = allowedChoices(field);

    for (const { suffix, str } of segments) {
        const p = `${path}${suffix}`;

        if (str === '' && allowEmpty) {
            continue;
        }

        if (str === '') {
            issues.push({
                type: 'error',
                code: 'SELECT_EMPTY',
                message: 'A selection is required.',
                path: p,
                context: { value: str }
            });
            continue;
        }

        if (allowed.length > 0 && !allowed.includes(str)) {
            issues.push({
                type: 'error',
                code: 'SELECT_INVALID_CHOICE',
                message: `Value "${str}" is not a valid choice.`,
                path: p,
                context: { value: str, allowed }
            });
        }
    }

    return issues;
}
