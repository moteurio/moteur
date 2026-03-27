import { describe, it, expect } from 'vitest';
import {
    validateDastField,
    validateDastStoredField
} from '../../../../src/validators/fields/core/validateDastField.js';
import { Field } from '@moteurio/types/Field.js';

const validDast = {
    schema: 'dast',
    document: {
        type: 'root',
        children: [
            {
                type: 'paragraph',
                children: [{ type: 'span', value: 'Hello' }]
            }
        ]
    }
};

describe('validateDastField', () => {
    const field: Field = { type: 'core/rich-text', label: 'Body' };

    it('accepts valid DAST document', () => {
        const issues = validateDastField(validDast, field, 'data.body');
        expect(issues).toEqual([]);
    });

    it('accepts null/undefined', () => {
        expect(validateDastField(null, field, 'data.body')).toEqual([]);
        expect(validateDastField(undefined, field, 'data.body')).toEqual([]);
    });

    it('returns error for non-object value', () => {
        const issues = validateDastField('not dast', field, 'data.body');
        expect(issues).toHaveLength(1);
        expect(issues[0].code).toBe('DAST_INVALID');
        expect(issues[0].message).toContain('DAST document');
    });

    it('returns error for object missing schema or document', () => {
        expect(validateDastField({ document: {} }, field, 'data.body')).toHaveLength(1);
        expect(validateDastField({ schema: 'dast' }, field, 'data.body')).toHaveLength(1);
        expect(
            validateDastField({ schema: 'dast', document: { type: 'root' } }, field, 'data.body')
        ).toHaveLength(1);
    });
});

describe('validateDastStoredField', () => {
    const field: Field = { type: 'core/rich-text', label: 'Body' };

    it('accepts single DAST document', () => {
        const issues = validateDastStoredField(validDast, field, 'data.body');
        expect(issues).toEqual([]);
    });

    it('accepts stored shape { dast: { locale: DastDocument } }', () => {
        const issues = validateDastStoredField(
            { dast: { en: validDast, fr: validDast } },
            field,
            'data.body'
        );
        expect(issues).toEqual([]);
    });

    it('returns error for invalid value type', () => {
        const issues = validateDastStoredField({ dast: 'not an object' }, field, 'data.body');
        expect(issues).toHaveLength(1);
        expect(issues[0].code).toBe('DAST_INVALID');
    });

    it('returns error for invalid document inside dast locale', () => {
        const issues = validateDastStoredField(
            { dast: { en: validDast, fr: { schema: 'dast' } } },
            field,
            'data.body'
        );
        expect(issues.length).toBeGreaterThan(0);
        expect(issues.some(i => i.path?.includes('.dast.'))).toBe(true);
    });
});
