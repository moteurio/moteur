import { describe, it, expect } from 'vitest';
import { validatePage } from '../../src/validators/validatePage.js';
import type { TemplateSchema } from '@moteurio/types/Template.js';

import '../../src/fields/index.js';

describe('validatePage', () => {
    const schema: TemplateSchema = {
        id: 'landing',
        projectId: 'p1',
        label: 'Landing',
        fields: {
            title: {
                type: 'core/text',
                label: 'Title',
                options: { required: true }
            },
            body: {
                type: 'core/text',
                label: 'Body',
                options: { required: false }
            }
        },
        createdAt: '',
        updatedAt: ''
    };

    it('returns valid when required fields are present', async () => {
        const page = {
            id: 'page1',
            fields: { title: 'Hello', body: 'World' }
        };
        const result = await validatePage('p1', page, schema);
        expect(result.valid).toBe(true);
        expect(result.issues).toHaveLength(0);
    });

    it('returns invalid when required field is missing', async () => {
        const page = {
            id: 'page1',
            fields: { body: 'Only body' }
        };
        const result = await validatePage('p1', page, schema);
        expect(result.valid).toBe(false);
        expect(
            result.issues.some(
                i => i.code === 'PAGE_MISSING_REQUIRED_FIELD' && i.message?.includes('title')
            )
        ).toBe(true);
    });

    it('returns invalid when required field is empty string', async () => {
        const page = {
            id: 'page1',
            fields: { title: '', body: 'x' }
        };
        const result = await validatePage('p1', page, schema);
        expect(result.valid).toBe(false);
    });

    it('accepts optional field missing', async () => {
        const page = {
            id: 'page1',
            fields: { title: 'Hi' }
        };
        const result = await validatePage('p1', page, schema);
        expect(result.valid).toBe(true);
    });

    it('returns valid for schema with no required fields', async () => {
        const minimalSchema: TemplateSchema = {
            id: 'min',
            projectId: 'p1',
            label: 'Min',
            fields: {
                x: { type: 'core/text', label: 'X', options: {} }
            },
            createdAt: '',
            updatedAt: ''
        };
        const page = {
            id: 'page1',
            fields: {} as Record<string, unknown>
        };
        const result = await validatePage('p1', page, minimalSchema);
        expect(result.valid).toBe(true);
    });

    it('blocks iframe in core/html on page fields when allowHtmlIframe is off', async () => {
        const htmlTemplate: TemplateSchema = {
            id: 't1',
            projectId: 'p1',
            label: 'T',
            fields: {
                body: {
                    type: 'core/html',
                    label: 'Body',
                    options: {
                        required: true,
                        allowedTags: ['p', 'iframe'],
                        allowedAttributes: { iframe: ['src'] }
                    }
                }
            },
            createdAt: '',
            updatedAt: ''
        };
        const page = {
            id: 'page1',
            fields: {
                body: { html: { en: '<iframe src="https://x.test"></iframe>' } }
            }
        };
        const denied = await validatePage('p1', page, htmlTemplate, {});
        expect(denied.valid).toBe(false);
        expect(denied.issues.some(i => i.code === 'HTML_IFRAME_NOT_ALLOWED')).toBe(true);

        const allowed = await validatePage('p1', page, htmlTemplate, { allowHtmlIframe: true });
        expect(allowed.valid).toBe(true);
        expect(allowed.issues.some(i => i.code === 'HTML_IFRAME_NOT_ALLOWED')).toBe(false);
    });
});
