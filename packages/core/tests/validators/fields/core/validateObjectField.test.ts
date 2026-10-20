import { describe, it, expect } from 'vitest';
import { validateObjectField } from '../../../../src/validators/fields/core/validateObjectField.js';
import { Field } from '@moteurio/types/Field.js';

describe('validateObjectField', () => {
    const subField: Field = { type: 'core/text', label: 'Name' };
    const field: Field = { type: 'core/object', label: 'Person', data: { name: subField } };

    it('validates object', () => {
        const issues = validateObjectField({ name: 'John' }, field, 'data.person');
        expect(issues).toEqual([]);
    });

    it('errors for missing required subfield', () => {
        const required: Field = {
            type: 'core/object',
            label: 'Person',
            data: { name: { ...subField, options: { required: true } } }
        };
        const issues = validateObjectField({}, required, 'data.person');
        expect(issues).toEqual([
            expect.objectContaining({
                type: 'error',
                code: 'OBJECT_MISSING_REQUIRED_FIELD',
                path: 'data.person.name'
            })
        ]);
    });

    it('accepts optional subfields left empty', () => {
        expect(validateObjectField({}, field, 'data.person')).toEqual([]);
        expect(validateObjectField({ name: null }, field, 'data.person')).toEqual([]);
    });

    it('accepts the wrapped form { value: {...} }', () => {
        expect(validateObjectField({ value: { name: 'John' } }, field, 'data.person')).toEqual([]);
    });

    it('does not mistake a field named "value" for the wrapper', () => {
        const pair: Field = {
            type: 'core/object',
            label: 'Spec',
            fields: {
                label: { type: 'core/text', label: 'Label', options: { multilingual: true } },
                value: { type: 'core/text', label: 'Value', options: { multilingual: true } }
            }
        } as Field;
        const issues = validateObjectField(
            { label: { fr: 'Garantie', en: 'Warranty' }, value: { fr: '30 ans', en: '30 years' } },
            pair,
            'data.spec'
        );
        expect(issues).toEqual([]);
    });
});
