import { ValidationIssue, ValidationResult } from '@moteurio/types/ValidationResult.js';

export function createValidationResult(): ValidationResult {
    return {
        valid: true,
        issues: []
    };
}

export function addIssue(result: ValidationResult, issue: ValidationIssue): void {
    result.issues.push(issue);
    if (issue.type === 'error') {
        result.valid = false;
    }
}

/**
 * Throws a validation error if any issue is an error. The message lists only the errors, each
 * with its path and message, never the warnings. The thrown error carries every issue with its
 * level in `issues`, so a client can show warnings separately. Warnings alone never cause a throw.
 */
export function assertNoErrors(what: string, issues: ValidationIssue[], status = 400): void {
    const errors = issues.filter(i => i.type === 'error');
    if (!errors.length) return;
    throw Object.assign(
        new Error(
            `${what} validation failed: ${errors.map(i => (i.path ? `${i.path}: ${i.message}` : i.message)).join('; ')}`
        ),
        { status, statusCode: status, code: 'VALIDATION_FAILED', issues }
    );
}

/** Whether a value is a valid schema label: a non-empty string, or a per-language object such as `{ "en": "Article", "fr": "Article" }`. */
export function isLabel(value: unknown): boolean {
    if (typeof value === 'string') return value.trim() !== '';
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const texts = Object.values(value as Record<string, unknown>);
    return (
        texts.length > 0 &&
        texts.every(t => typeof t === 'string') &&
        texts.some(t => (t as string).trim() !== '')
    );
}

/** The message shown when a label is rejected. */
export const LABEL_RULE = 'a name, or a name per language ({ "en": "…", "fr": "…" })';

/** Returns a label as a single text: the string itself, or the first non-empty language of a per-language label. */
export function labelText(label: unknown, fallback: string): string {
    if (typeof label === 'string' && label.trim()) return label;
    if (label && typeof label === 'object') {
        const first = Object.values(label as Record<string, unknown>).find(
            t => typeof t === 'string' && t.trim()
        );
        if (typeof first === 'string') return first;
    }
    return fallback;
}
