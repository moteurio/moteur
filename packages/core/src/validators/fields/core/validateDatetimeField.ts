import { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import { Field } from '@moteurio/types/Field.js';
import { isLikelyLocaleStringMap, isPlainObject } from '../../fieldValueUtils.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** 24h HH:MM (00–23). */
const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function collectDateStrings(value: unknown): { suffix: string; str: string }[] | 'invalid' {
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

function minMaxFromOptions(field: Field): { min?: string; max?: string } {
    const o = field.options || {};
    return {
        min: (o.minDate ?? o.min) as string | undefined,
        max: (o.maxDate ?? o.max) as string | undefined
    };
}

function validateDateSegment(str: string, field: Field, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (!ISO_DATE.test(str)) {
        issues.push({
            type: 'error',
            code: 'DATETIME_INVALID_FORMAT',
            message: 'Date must be YYYY-MM-DD.',
            path,
            context: { value: str }
        });
        return issues;
    }

    const { min, max } = minMaxFromOptions(field);
    if (min && str < min) {
        issues.push({
            type: 'error',
            code: 'DATETIME_BEFORE_MIN_DATE',
            message: `Date is earlier than minimum allowed date: ${min}.`,
            path,
            context: { value: str, minDate: min }
        });
    }
    if (max && str > max) {
        issues.push({
            type: 'error',
            code: 'DATETIME_AFTER_MAX_DATE',
            message: `Date is later than maximum allowed date: ${max}.`,
            path,
            context: { value: str, maxDate: max }
        });
    }
    return issues;
}

function validateTimeSegment(str: string, field: Field, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (!TIME_HHMM.test(str)) {
        issues.push({
            type: 'error',
            code: 'DATETIME_INVALID_FORMAT',
            message: 'Time must be HH:MM (24-hour).',
            path,
            context: { value: str }
        });
        return issues;
    }

    const { min, max } = minMaxFromOptions(field);
    if (min && str < min) {
        issues.push({
            type: 'error',
            code: 'DATETIME_BEFORE_MIN_DATE',
            message: `Time is earlier than minimum allowed: ${min}.`,
            path,
            context: { value: str, min }
        });
    }
    if (max && str > max) {
        issues.push({
            type: 'error',
            code: 'DATETIME_AFTER_MAX_DATE',
            message: `Time is later than maximum allowed: ${max}.`,
            path,
            context: { value: str, max }
        });
    }
    return issues;
}

function validateDateTimeSegment(str: string, field: Field, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const parsedDate = Date.parse(str);
    if (Number.isNaN(parsedDate)) {
        issues.push({
            type: 'error',
            code: 'DATETIME_INVALID_FORMAT',
            message: 'Date-time value is not a valid ISO 8601 date.',
            path,
            context: { value: str }
        });
        return issues;
    }

    const date = new Date(parsedDate);

    if (field.options?.allowPastDates === false && date < new Date()) {
        issues.push({
            type: 'error',
            code: 'DATETIME_PAST_NOT_ALLOWED',
            message: 'Past dates are not allowed.',
            path,
            context: { value: str }
        });
    }

    if (field.options?.allowFutureDates === false && date > new Date()) {
        issues.push({
            type: 'error',
            code: 'DATETIME_FUTURE_NOT_ALLOWED',
            message: 'Future dates are not allowed.',
            path,
            context: { value: str }
        });
    }

    const { min, max } = minMaxFromOptions(field);
    if (min) {
        const minMs = Date.parse(min);
        if (!Number.isNaN(minMs) && parsedDate < minMs) {
            issues.push({
                type: 'error',
                code: 'DATETIME_BEFORE_MIN_DATE',
                message: `Date is earlier than minimum allowed: ${min}.`,
                path,
                context: { value: str, minDate: min }
            });
        }
    }
    if (max) {
        const maxMs = Date.parse(max);
        if (!Number.isNaN(maxMs) && parsedDate > maxMs) {
            issues.push({
                type: 'error',
                code: 'DATETIME_AFTER_MAX_DATE',
                message: `Date is later than maximum allowed: ${max}.`,
                path,
                context: { value: str, maxDate: max }
            });
        }
    }

    return issues;
}

export function validateDateTimeField(value: any, field: Field, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const segments = collectDateStrings(value);

    if (segments === 'invalid') {
        issues.push({
            type: 'error',
            code: 'DATETIME_INVALID_TYPE',
            message: 'Expected a string, locale map, or { value: string | locale map }.',
            path,
            context: { value }
        });
        return issues;
    }

    const ftype = field.type;

    for (const { suffix, str } of segments) {
        const p = `${path}${suffix}`;

        if (ftype === 'core/date') {
            issues.push(...validateDateSegment(str, field, p));
        } else if (ftype === 'core/time') {
            issues.push(...validateTimeSegment(str, field, p));
        } else {
            issues.push(...validateDateTimeSegment(str, field, p));
        }
    }

    return issues;
}
