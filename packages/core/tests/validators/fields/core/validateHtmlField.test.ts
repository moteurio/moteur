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

    it('returns error for iframe when project does not allow iframes', () => {
        const htmlField: Field = {
            type: 'core/html',
            label: 'Content',
            options: { allowedTags: ['p', 'iframe'] }
        };
        const issues = validateHtmlField(
            '<p><iframe src="https://x.test"></iframe></p>',
            htmlField,
            'x',
            {}
        );
        expect(issues.some(i => i.code === 'HTML_IFRAME_NOT_ALLOWED')).toBe(true);
    });

    it('allows iframe when allowHtmlIframe and allowedTags include iframe', () => {
        const htmlField: Field = {
            type: 'core/html',
            label: 'Content',
            options: {
                allowedTags: ['p', 'iframe'],
                allowedAttributes: { iframe: ['src'] }
            }
        };
        const issues = validateHtmlField(
            '<p><iframe src="https://x.test"></iframe></p>',
            htmlField,
            'x',
            { allowHtmlIframe: true }
        );
        expect(issues.some(i => i.code === 'HTML_IFRAME_NOT_ALLOWED')).toBe(false);
    });

    it('returns error for embed when project does not allow embeds', () => {
        const htmlField: Field = {
            type: 'core/html',
            label: 'Content',
            options: { allowedTags: ['p', 'embed'] }
        };
        const issues = validateHtmlField('<p><embed src="x"></embed></p>', htmlField, 'x', {});
        expect(issues.some(i => i.code === 'HTML_EMBED_NOT_ALLOWED')).toBe(true);
    });

    it('allows embed when allowHtmlEmbed and allowedTags include embed', () => {
        const htmlField: Field = {
            type: 'core/html',
            label: 'Content',
            options: {
                allowedTags: ['p', 'embed'],
                allowedAttributes: { embed: ['src'] }
            }
        };
        const issues = validateHtmlField('<p><embed src="x"></embed></p>', htmlField, 'x', {
            allowHtmlEmbed: true
        });
        expect(issues.some(i => i.code === 'HTML_EMBED_NOT_ALLOWED')).toBe(false);
    });
});
