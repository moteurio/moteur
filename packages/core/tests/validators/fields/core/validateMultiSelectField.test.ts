import { describe, it, expect } from 'vitest';
import { validateMultiSelectField } from '../../../../src/validators/fields/core/validateMultiSelectField.js';
import { Field } from '@moteurio/types/Field.js';

describe('validateMultiSelectField', () => {
    const field: Field = { type: 'core/multi-select', label: 'Tags' };

    it('validates array of strings', () => {
        expect(validateMultiSelectField(['a', 'b'], field, 'data.tags')).toEqual([]);
    });

    it('allows empty array when allowEmpty is true', () => {
        const f: Field = { type: 'core/multi-select', options: { allowEmpty: true } };
        expect(validateMultiSelectField([], f, 'data.tags')).toEqual([]);
    });

    it('returns error for empty array when allowEmpty is false', () => {
        const f: Field = { type: 'core/multi-select', options: { allowEmpty: false } };
        const issues = validateMultiSelectField([], f, 'data.tags');
        expect(issues[0].code).toBe('MULTI_SELECT_EMPTY');
    });

    it('returns error for non-array', () => {
        const issues = validateMultiSelectField('single', field, 'data.tags');
        expect(issues[0].code).toBe('MULTI_SELECT_INVALID_TYPE');
    });

    it('returns error for array with non-string items', () => {
        const issues = validateMultiSelectField(['a', 123, 'b'], field, 'data.tags');
        expect(issues).toHaveLength(1);
        expect(issues[0].code).toBe('MULTI_SELECT_ITEM_INVALID_TYPE');
    });

    it('returns error when choice is not in options.choices', () => {
        const f: Field = {
            type: 'core/multi-select',
            label: 'Tags',
            options: {
                choices: [
                    { value: 'a', label: 'A' },
                    { value: 'b', label: 'B' }
                ]
            }
        };
        const issues = validateMultiSelectField(['a', 'zzz'], f, 'data.tags');
        expect(issues.some(i => i.code === 'MULTI_SELECT_INVALID_CHOICE')).toBe(true);
    });
});
