import { describe, it, expect } from 'vitest';
import { validateTemplate } from '../../src/validators/validateTemplate.js';
import type { TemplateSchema } from '@moteurio/types/Template.js';

describe('validateTemplate', () => {
    const validTemplate: TemplateSchema = {
        id: 'landing-page',
        projectId: 'proj1',
        label: 'Landing Page',
        description: 'Home page template',
        fields: {
            title: { type: 'core/text', label: 'Title', options: {} },
            body: { type: 'core/richtext', label: 'Body', options: {} }
        },
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
    };

    it('returns valid for a complete template', () => {
        const result = validateTemplate(validTemplate);
        expect(result.valid).toBe(true);
        expect(result.issues).toHaveLength(0);
    });

    it('returns invalid when id is missing', () => {
        const result = validateTemplate({ ...validTemplate, id: '' });
        expect(result.valid).toBe(false);
        expect(result.issues.some(i => i.code === 'TEMPLATE_INVALID_ID')).toBe(true);
    });

    it('returns invalid when id is not a string', () => {
        const result = validateTemplate({ ...validTemplate, id: 123 as any });
        expect(result.valid).toBe(false);
        expect(result.issues.some(i => i.code === 'TEMPLATE_INVALID_ID')).toBe(true);
    });

    it('returns invalid when label is missing', () => {
        const result = validateTemplate({ ...validTemplate, label: '' });
        expect(result.valid).toBe(false);
        expect(result.issues.some(i => i.code === 'TEMPLATE_INVALID_LABEL')).toBe(true);
    });

    it('returns invalid when description is not a string', () => {
        const result = validateTemplate({ ...validTemplate, description: 1 as any });
        expect(result.valid).toBe(false);
        expect(result.issues.some(i => i.code === 'TEMPLATE_INVALID_DESCRIPTION')).toBe(true);
    });

    it('accepts undefined description', () => {
        const result = validateTemplate({ ...validTemplate, description: undefined });
        expect(result.valid).toBe(true);
    });

    it('returns invalid when fields is missing', () => {
        const result = validateTemplate({ ...validTemplate, fields: undefined as any });
        expect(result.valid).toBe(false);
        expect(result.issues.some(i => i.code === 'TEMPLATE_INVALID_FIELDS')).toBe(true);
    });

    it('returns invalid when fields is an array', () => {
        const result = validateTemplate({ ...validTemplate, fields: [] as any });
        expect(result.valid).toBe(false);
        expect(result.issues.some(i => i.code === 'TEMPLATE_INVALID_FIELDS')).toBe(true);
    });

    it('returns invalid when a field definition has no type', () => {
        const result = validateTemplate({
            ...validTemplate,
            fields: {
                title: { label: 'Title' } as any
            }
        });
        expect(result.valid).toBe(false);
        expect(result.issues.some(i => i.code === 'TEMPLATE_INVALID_FIELD')).toBe(true);
    });

    it('returns valid for empty fields object', () => {
        const result = validateTemplate({ ...validTemplate, fields: {} });
        expect(result.valid).toBe(true);
    });
});
