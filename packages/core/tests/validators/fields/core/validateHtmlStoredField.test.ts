import { describe, it, expect } from 'vitest';
import { validateHtmlStoredField } from '../../../../src/validators/fields/core/validateHtmlField.js';
import { Field } from '@moteurio/types/Field.js';

describe('validateHtmlStoredField', () => {
    const field: Field = { type: 'core/html', label: 'Content' };

    it('validates string as valid HTML', () => {
        const issues = validateHtmlStoredField('<p>Hello</p>', field, 'data.content');
        expect(issues).toEqual([]);
    });

    it('validates stored shape { html: { locale: string } }', () => {
        const issues = validateHtmlStoredField(
            { html: { en: '<p>Hi</p>', fr: '<p>Bonjour</p>' } },
            field,
            'data.content'
        );
        expect(issues).toEqual([]);
    });

    it('returns error for non-string value inside html', () => {
        const issues = validateHtmlStoredField(
            { html: { en: 123 as unknown as string } },
            field,
            'data.content'
        );
        expect(issues).toHaveLength(1);
        expect(issues[0].code).toBe('HTML_INVALID_TYPE');
        expect(issues[0].path).toContain('.html.');
    });

    it('returns error for invalid stored shape', () => {
        const issues = validateHtmlStoredField({ foo: 'bar' }, field, 'data.content');
        expect(issues).toHaveLength(1);
        expect(issues[0].code).toBe('HTML_INVALID_TYPE');
        expect(issues[0].message).toContain('string (HTML) or { html:');
    });
});
