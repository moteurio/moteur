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
 * Refuses what has errors: the message says the errors (where, and what), never the notes; the
 * error carries every issue with its level (`issues`), so a client can show the notes apart.
 * Notes alone (warnings) never refuse anything.
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

/** A schema's name: one, or one per language (`{ "en": "Article", "fr": "Article" }`). */
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

/** What a refused label is told. */
export const LABEL_RULE = 'a name, or a name per language ({ "en": "…", "fr": "…" })';

/** A label as one text: the string, or its first language's. */
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
