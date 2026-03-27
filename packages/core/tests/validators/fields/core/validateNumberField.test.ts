import { describe, it, expect } from 'vitest';
import { validateNumberField } from '../../../../src/validators/fields/core/validateNumberField.js';
import { Field } from '@moteurio/types/Field.js';

describe('validateNumberField', () => {
    const field: Field = {
        type: 'core/number',
        label: 'Age',
        options: { min: 0, max: 100 }
    };

    it('validates a number within range', () => {
        const issues = validateNumberField(42, field, 'data.age');
        expect(issues).toEqual([]);
    });

    it('errors if below min', () => {
        const issues = validateNumberField(-1, field, 'data.age');
        expect(issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: 'error',
                    code: 'NUMBER_BELOW_MIN'
                })
            ])
        );
    });

    it('errors if above max', () => {
        const issues = validateNumberField(200, field, 'data.age');
        expect(issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: 'error',
                    code: 'NUMBER_ABOVE_MAX'
                })
            ])
        );
    });

    it('errors for non-number value', () => {
        const issues = validateNumberField('not-a-number', field, 'data.age');
        expect(issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: 'error',
                    code: 'NUMBER_INVALID_TYPE'
                })
            ])
        );
    });
});
