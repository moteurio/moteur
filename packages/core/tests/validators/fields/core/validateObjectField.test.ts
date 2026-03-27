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
        const issues = validateObjectField({}, field, 'data.person');
        expect(issues).toEqual(
            expect.arrayContaining([expect.objectContaining({ type: 'error' })])
        );
    });
});
