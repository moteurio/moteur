import { describe, it, expect } from 'vitest';
import { validateMarkdownField } from '../../../../src/validators/fields/core/validateMarkdownField.js';
import { Field } from '@moteurio/types/Field.js';

describe('validateMarkdownField', () => {
    const field: Field = { type: 'core/markdown', label: 'Content' };

    it('validates string as valid markdown', () => {
        const issues = validateMarkdownField('# Hello\n\nWorld', field, 'data.content');
        expect(issues).toEqual([]);
    });

    it('validates empty string', () => {
        const issues = validateMarkdownField('', field, 'data.content');
        expect(issues).toEqual([]);
    });

    it('validates locale map of strings', () => {
        const issues = validateMarkdownField({ en: 'Hi', fr: 'Salut' }, field, 'data.content');
        expect(issues).toEqual([]);
    });

    it('validates { markdown: locale map }', () => {
        const issues = validateMarkdownField(
            { markdown: { en: '# Title' } },
            field,
            'data.content'
        );
        expect(issues).toEqual([]);
    });

    it('returns error for non-string value', () => {
        const issues = validateMarkdownField(123, field, 'data.content');
        expect(issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: 'error',
                    code: 'MARKDOWN_INVALID_TYPE'
                })
            ])
        );
    });

    it('returns error for null', () => {
        const issues = validateMarkdownField(null, field, 'data.content');
        expect(issues).toHaveLength(1);
        expect(issues[0].code).toBe('MARKDOWN_INVALID_TYPE');
    });

    it('returns error for invalid object shape', () => {
        const issues = validateMarkdownField({ foo: 'bar' }, field, 'data.content');
        expect(issues).toHaveLength(1);
        expect(issues[0].code).toBe('MARKDOWN_INVALID_TYPE');
    });
});
