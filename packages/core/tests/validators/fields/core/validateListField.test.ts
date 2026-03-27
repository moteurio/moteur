import { describe, it, expect } from 'vitest';
import { validateListField } from '../../../../src/validators/fields/core/validateListField.js';
import { Field } from '@moteurio/types/Field.js';

describe('validateListField', () => {
    const itemField: Field = { type: 'core/text', label: 'Item' };
    const field: Field = { type: 'core/list', label: 'Tags', options: { items: itemField } };

    it('validates array of strings', () => {
        const issues = validateListField(['a', 'b'], field, 'data.tags');
        expect(issues).toEqual([]);
    });

    it('errors for non-array', () => {
        const issues = validateListField('not-an-array', field, 'data.tags');
        expect(issues).toEqual(
            expect.arrayContaining([expect.objectContaining({ type: 'error' })])
        );
    });
});
