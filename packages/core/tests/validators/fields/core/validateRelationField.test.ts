import { describe, it, expect } from 'vitest';
import { validateRelationField } from '../../../../src/validators/fields/core/validateRelationField.js';
import { Field } from '@moteurio/types/Field.js';

describe('validateRelationField', () => {
    const base: Field = { type: 'core/relation', label: 'Author', options: { model: 'authors' } };

    it('requires a value when allowEmpty is not explicitly true', () => {
        const field: Field = { type: 'core/relation', label: 'Author' };
        const issues = validateRelationField(null, field, 'data.author');
        expect(issues.some(i => i.code === 'RELATION_EMPTY')).toBe(true);
    });

    it('allows empty only when allowEmpty: true', () => {
        const field: Field = {
            type: 'core/relation',
            label: 'Author',
            options: { model: 'authors', allowEmpty: true }
        };
        expect(validateRelationField(null, field, 'data.author')).toEqual([]);
    });

    it('accepts { value: { id } }', () => {
        expect(
            validateRelationField({ value: { id: 'e1', model: 'authors' } }, base, 'data.r')
        ).toEqual([]);
    });

    it('accepts string id', () => {
        expect(validateRelationField('entry-uuid', base, 'data.r')).toEqual([]);
    });
});
