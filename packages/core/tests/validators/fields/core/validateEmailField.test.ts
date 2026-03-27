import { describe, it, expect } from 'vitest';
import { validateEmailField } from '../../../../src/validators/fields/core/validateEmailField.js';
import { Field } from '@moteurio/types/Field.js';

describe('validateEmailField', () => {
    const field: Field = { type: 'core/email', label: 'Email' };

    it('validates valid email', () => {
        expect(validateEmailField('user@example.com', field, 'data.email')).toEqual([]);
        expect(validateEmailField('a@b.co', field, 'data.email')).toEqual([]);
    });

    it('returns error for invalid email format', () => {
        const issues = validateEmailField('not-an-email', field, 'data.email');
        expect(issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: 'EMAIL_INVALID_FORMAT',
                    message: 'Value is not a valid email address.'
                })
            ])
        );
    });

    it('returns error for empty string when allowEmpty is false', () => {
        const issues = validateEmailField('', field, 'data.email');
        expect(issues).toHaveLength(1);
        expect(issues[0].code).toBe('EMAIL_EMPTY');
    });

    it('allows empty when allowEmpty is true', () => {
        const f: Field = { type: 'core/email', label: 'Email', options: { allowEmpty: true } };
        expect(validateEmailField('', f, 'data.email')).toEqual([]);
    });

    it('returns error for non-string', () => {
        const issues = validateEmailField(123, field, 'data.email');
        expect(issues[0].code).toBe('EMAIL_INVALID_TYPE');
    });
});
