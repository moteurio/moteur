import { Field } from '@moteurio/types/Field.js';
import { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import { isPlainObject } from '../../fieldValueUtils.js';
import { validateFieldValue } from '../../validateFieldValue.js';

function resolveItemField(field: Field): Field | undefined {
    const opts = field.options || {};
    const fromOpts = opts.items as Field | undefined;
    const fromField = (field as Field & { items?: Field }).items;
    return fromOpts ?? fromField;
}

export function validateListField(value: any, field: Field, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    let arr = value;
    if (isPlainObject(value) && Array.isArray(value.items)) {
        arr = value.items;
    }

    if (!Array.isArray(arr)) {
        issues.push({
            type: 'error',
            code: 'LIST_INVALID_TYPE',
            message: 'Expected a list (array) or { items: array }.',
            path,
            context: { value }
        });
        return issues;
    }

    const opts = field.options || {};
    const allowEmpty = opts.allowEmpty === true;
    if (!allowEmpty && arr.length === 0) {
        issues.push({
            type: 'error',
            code: 'LIST_EMPTY',
            message: 'List cannot be empty.',
            path,
            context: { value: arr }
        });
    }

    if (opts.minItems != null && arr.length < opts.minItems) {
        issues.push({
            type: 'error',
            code: 'LIST_TOO_FEW_ITEMS',
            message: `List must have at least ${opts.minItems} items.`,
            path,
            context: { count: arr.length, min: opts.minItems }
        });
    }

    if (opts.maxItems != null && arr.length > opts.maxItems) {
        issues.push({
            type: 'error',
            code: 'LIST_TOO_MANY_ITEMS',
            message: `List must have at most ${opts.maxItems} items.`,
            path,
            context: { count: arr.length, max: opts.maxItems }
        });
    }

    if (opts.uniqueItems === true) {
        const seen = new Set<string>();
        for (let i = 0; i < arr.length; i++) {
            const key = JSON.stringify(arr[i]);
            if (seen.has(key)) {
                issues.push({
                    type: 'error',
                    code: 'LIST_DUPLICATE_ITEM',
                    message: 'List items must be unique.',
                    path: `${path}[${i}]`,
                    context: { index: i }
                });
            }
            seen.add(key);
        }
    }

    const itemField = resolveItemField(field);
    if (!itemField) {
        if (arr.length === 0) {
            return issues;
        }
        issues.push({
            type: 'warning',
            code: 'LIST_MISSING_ITEMS',
            message: 'No item schema found (set "items" on the field or options.items).',
            path,
            context: { value: arr }
        });
        return issues;
    }

    arr.forEach((item, index) => {
        const itemPath = `${path}[${index}]`;
        issues.push(...validateFieldValue(item, itemField, itemPath));
    });

    return issues;
}
