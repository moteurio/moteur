import { Field } from '@moteurio/types/Field.js';
import { ValidationIssue } from '@moteurio/types/ValidationResult.js';

function isDastDocument(
    value: unknown
): value is { schema: string; document: { type: string; children: unknown[] } } {
    return (
        typeof value === 'object' &&
        value !== null &&
        (value as { schema?: string }).schema === 'dast' &&
        typeof (value as { document?: unknown }).document === 'object' &&
        (value as { document: { type?: string; children?: unknown[] } }).document?.type ===
            'root' &&
        Array.isArray((value as { document: { children?: unknown[] } }).document?.children)
    );
}

/**
 * Validates a single DAST document.
 */
export function validateDastField(value: any, field: Field, path: string): ValidationIssue[] {
    if (value === null || value === undefined) {
        return [];
    }
    if (!isDastDocument(value)) {
        return [
            {
                type: 'error',
                code: 'DAST_INVALID',
                message:
                    'Value must be a DAST document (schema: "dast", document.type: "root", document.children: array).',
                path,
                context: { value }
            }
        ];
    }
    return [];
}

/**
 * Validates core/rich-text stored value: DastDocument or { dast: Record<locale, DastDocument> }.
 */
export function validateDastStoredField(value: any, field: Field, path: string): ValidationIssue[] {
    if (value === null || value === undefined) return [];
    if (isDastDocument(value)) return validateDastField(value, field, path);
    if (value && typeof value === 'object' && value.dast && typeof value.dast === 'object') {
        const issues: ValidationIssue[] = [];
        for (const [locale, doc] of Object.entries(value.dast)) {
            issues.push(...validateDastField(doc, field, `${path}.dast.${locale}`));
        }
        return issues;
    }
    return [
        {
            type: 'error',
            code: 'DAST_INVALID',
            message: 'Value must be a DAST document or { dast: Record<locale, DastDocument> }.',
            path,
            context: { value }
        }
    ];
}
