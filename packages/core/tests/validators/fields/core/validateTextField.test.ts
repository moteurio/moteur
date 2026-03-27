import { describe, it, expect } from 'vitest';
import { validateTextField } from '../../../../src/validators/fields/core/validateTextField.js';
import { Field } from '@moteurio/types/Field.js';

describe('validateTextField', () => {
    const field: Field = {
        type: 'core/text',
        label: 'Title',
        options: {
            minLength: 3,
            maxLength: 10,
            pattern: '^[a-zA-Z]+$'
        }
    };

    it('validates string type', () => {
        const issues = validateTextField('Hello', field, 'data.title');
        expect(issues).toEqual([]);
    });

    it('returns error for non-string value', () => {
        const issues = validateTextField(123, field, 'data.title');
        expect(issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ type: 'error', code: 'TEXT_INVALID_TYPE' })
            ])
        );
    });

    it('returns error for string shorter than minLength', () => {
        const issues = validateTextField('Hi', field, 'data.title');
        expect(issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: 'error',
                    message: 'Value is too short (min 3 chars).'
                })
            ])
        );
    });

    it('returns error for string longer than maxLength', () => {
        const issues = validateTextField('ThisIsWayTooLong', field, 'data.title');
        expect(issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: 'error',
                    message: 'Value is too long (max 10 chars).'
                })
            ])
        );
    });

    it('returns error for string not matching pattern', () => {
        const issues = validateTextField('Hello123', field, 'data.title');
        expect(issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: 'error',
                    message: expect.stringContaining('does not match pattern')
                })
            ])
        );
    });
});
