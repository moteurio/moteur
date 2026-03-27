import { describe, it, expect } from 'vitest';
import { validateDateTimeField } from '../../../../src/validators/fields/core/validateDatetimeField.js';
import { Field } from '@moteurio/types/Field.js';

describe('validateDateTimeField', () => {
    const field: Field = { type: 'core/datetime', label: 'Date' };

    it('validates ISO8601 date', () => {
        const issues = validateDateTimeField('2024-01-01T12:00:00Z', field, 'data.date');
        expect(issues).toEqual([]);
    });

    it('errors for non-date string', () => {
        const issues = validateDateTimeField('note-a-date', field, 'data.date');
        expect(issues).toEqual(
            expect.arrayContaining([expect.objectContaining({ type: 'error' })])
        );
    });

    it('errors for non-string, invalid date type', () => {
        const issues = validateDateTimeField(false, field, 'data.date');
        expect(issues).toEqual(
            expect.arrayContaining([expect.objectContaining({ type: 'error' })])
        );
    });

    it('validates core/time HH:MM', () => {
        const f: Field = { type: 'core/time', label: 'T' };
        expect(validateDateTimeField('09:30', f, 'data.t')).toEqual([]);
        expect(
            validateDateTimeField('25:00', f, 'data.t').some(
                i => i.code === 'DATETIME_INVALID_FORMAT'
            )
        ).toBe(true);
    });

    it('validates core/date YYYY-MM-DD and min option', () => {
        const f: Field = { type: 'core/date', label: 'D', options: { min: '2024-06-01' } };
        expect(validateDateTimeField('2024-06-15', f, 'data.d')).toEqual([]);
        expect(
            validateDateTimeField('2024-01-01', f, 'data.d').some(
                i => i.code === 'DATETIME_BEFORE_MIN_DATE'
            )
        ).toBe(true);
    });
});
