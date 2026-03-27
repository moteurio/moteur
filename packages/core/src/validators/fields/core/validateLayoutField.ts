import type { Field } from '@moteurio/types/Field.js';
import type { ValidationIssue } from '@moteurio/types/ValidationResult.js';

/**
 * Structural validation only. Deep validation against the project Layout resource
 * runs in validateLayoutFieldValues (async, with projectId).
 */
export function validateLayoutField(value: any, field: Field, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const allowEmpty = field.options?.allowEmpty === true;

    if (value === undefined || value === null) {
        if (!allowEmpty) {
            issues.push({
                type: 'error',
                code: 'LAYOUT_EMPTY',
                message: 'Layout field cannot be empty.',
                path,
                context: { value }
            });
        }
        return issues;
    }

    if (typeof value !== 'object' || Array.isArray(value)) {
        issues.push({
            type: 'error',
            code: 'LAYOUT_NOT_OBJECT',
            message: 'Layout field must be an object with layoutId and slots.',
            path,
            context: { value }
        });
        return issues;
    }

    const layoutId = (value as Record<string, unknown>).layoutId;
    if (typeof layoutId !== 'string' || !layoutId.trim()) {
        issues.push({
            type: 'error',
            code: 'LAYOUT_ID_INVALID',
            message: 'layoutId must be a non-empty string.',
            path: `${path}.layoutId`,
            context: { value }
        });
    }

    const defaultLayoutId = field.options?.defaultLayoutId as string | undefined;
    if (defaultLayoutId && typeof layoutId === 'string' && layoutId !== defaultLayoutId) {
        issues.push({
            type: 'error',
            code: 'LAYOUT_ID_MISMATCH',
            message: `layoutId must be "${defaultLayoutId}" for this field.`,
            path: `${path}.layoutId`,
            context: { value }
        });
    }

    const slots = (value as Record<string, unknown>).slots;
    if (slots === undefined) {
        issues.push({
            type: 'error',
            code: 'LAYOUT_SLOTS_MISSING',
            message: 'slots array is required (may be empty).',
            path: `${path}.slots`
        });
        return issues;
    }

    if (!Array.isArray(slots)) {
        issues.push({
            type: 'error',
            code: 'LAYOUT_SLOTS_NOT_ARRAY',
            message: 'slots must be an array.',
            path: `${path}.slots`
        });
        return issues;
    }

    slots.forEach((slot: unknown, i: number) => {
        const sp = `${path}.slots[${i}]`;
        if (!slot || typeof slot !== 'object' || Array.isArray(slot)) {
            issues.push({
                type: 'error',
                code: 'LAYOUT_SLOT_INVALID',
                message: 'Each slot must be an object with id and data.',
                path: sp
            });
            return;
        }
        const s = slot as Record<string, unknown>;
        if (typeof s.id !== 'string' || !s.id.trim()) {
            issues.push({
                type: 'error',
                code: 'LAYOUT_SLOT_ID',
                message:
                    'Each slot must have a non-empty string id (matches Layout block meta.id or index).',
                path: `${sp}.id`
            });
        }
        if (
            s.data !== undefined &&
            (typeof s.data !== 'object' || s.data === null || Array.isArray(s.data))
        ) {
            issues.push({
                type: 'error',
                code: 'LAYOUT_SLOT_DATA',
                message: 'slot.data must be an object when present.',
                path: `${sp}.data`
            });
        }
    });

    return issues;
}
