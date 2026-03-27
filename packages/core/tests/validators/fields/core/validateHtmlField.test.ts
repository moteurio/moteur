import { describe, it, expect } from 'vitest';
import { validateHtmlField } from '../../../../src/validators/fields/core/validateHtmlField.js';
import { Field } from '@moteurio/types/Field.js';

describe('validateHtmlField', () => {
    const field: Field = { type: 'core/html', label: 'Content' };

    it('validates string as valid HTML', () => {
        const issues = validateHtmlField('<p>Hello</p>', field, 'data.content');
        expect(issues).toEqual([]);
    });

    it('returns error for non-string value', () => {
        const issues = validateHtmlField(123, field, 'data.content');
        expect(issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: 'error',
                    code: 'HTML_INVALID_TYPE',
                    message: 'Value must be a string (HTML).'
                })
            ])
        );
    });

    it('returns error for null', () => {
        const issues = validateHtmlField(null, field, 'data.content');
        expect(issues).toHaveLength(1);
        expect(issues[0].code).toBe('HTML_INVALID_TYPE');
    });
});
