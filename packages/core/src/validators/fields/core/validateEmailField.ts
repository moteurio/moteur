import { Field } from '@moteurio/types/Field.js';
import { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import { isLikelyLocaleStringMap, isPlainObject } from '../../fieldValueUtils.js';

/** Standard email format regex (RFC 5322 simplified). */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function collectEmails(value: unknown): { suffix: string; email: string }[] | 'invalid' {
    if (typeof value === 'string') {
        return [{ suffix: '', email: value }];
    }
    if (!isPlainObject(value)) {
        return 'invalid';
    }
    if (typeof value.value === 'string') {
        return [{ suffix: '.value', email: value.value }];
    }
    if (isPlainObject(value.value) && isLikelyLocaleStringMap(value.value)) {
        return Object.entries(value.value).map(([loc, email]) => ({
            suffix: `.value.${loc}`,
            email
        }));
    }
    if (isLikelyLocaleStringMap(value)) {
        return Object.entries(value).map(([loc, email]) => ({ suffix: `.${loc}`, email }));
    }
    return 'invalid';
}

export function validateEmailField(value: any, field: Field, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    const segments = collectEmails(value);
    if (segments === 'invalid') {
        issues.push({
            type: 'error',
            code: 'EMAIL_INVALID_TYPE',
            message: 'Expected a string, locale map, or { value: string | locale map }.',
            path,
            context: { value }
        });
        return issues;
    }

    const allowEmpty = field.options?.allowEmpty === true;

    for (const { suffix, email } of segments) {
        const p = `${path}${suffix}`;

        if (allowEmpty && (email === '' || email.trim() === '')) {
            continue;
        }

        if (email.trim() === '') {
            issues.push({
                type: 'error',
                code: 'EMAIL_EMPTY',
                message: 'Email cannot be empty.',
                path: p,
                context: { value: email }
            });
            continue;
        }

        if (!EMAIL_REGEX.test(email.trim())) {
            issues.push({
                type: 'error',
                code: 'EMAIL_INVALID_FORMAT',
                message: 'Value is not a valid email address.',
                path: p,
                context: { value: email }
            });
        }
    }

    return issues;
}
