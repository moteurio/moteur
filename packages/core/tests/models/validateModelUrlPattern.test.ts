import { describe, it, expect } from 'vitest';
import { validateModelUrlPattern } from '../../src/models.js';
import type { ModelSchema } from '@moteurio/types/Model.js';

describe('validateModelUrlPattern', () => {
    const schemaWithSlug: ModelSchema = {
        id: 'post',
        label: 'Post',
        fields: {
            slug: { type: 'core/text', label: 'Slug', options: {} },
            title: { type: 'core/text', label: 'Title', options: {} },
            category: {
                type: 'core/reference',
                label: 'Category',
                options: { modelId: 'category' }
            }
        }
    };

    it('returns empty array when pattern is undefined or empty', () => {
        expect(validateModelUrlPattern(undefined, schemaWithSlug)).toEqual([]);
        expect(validateModelUrlPattern('', schemaWithSlug)).toEqual([]);
    });

    it('returns empty array when all refs exist on model', () => {
        expect(validateModelUrlPattern('[slug]', schemaWithSlug)).toEqual([]);
        expect(validateModelUrlPattern('[slug]/[title]', schemaWithSlug)).toEqual([]);
    });

    it('returns warning when pattern references non-existent top-level field', () => {
        const warnings = validateModelUrlPattern('[missing]', schemaWithSlug);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('missing');
        expect(warnings[0]).toContain('not defined');
    });

    it('does not warn for dot path when top-level field exists', () => {
        const warnings = validateModelUrlPattern('[category.slug]', schemaWithSlug);
        expect(warnings).toHaveLength(0);
    });

    it('returns warning for dot path when top-level field is missing', () => {
        const warnings = validateModelUrlPattern('[author.name]', schemaWithSlug);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('author.name');
    });

    it('returns multiple warnings for multiple invalid refs', () => {
        const warnings = validateModelUrlPattern('[a]/[b]/[slug]', schemaWithSlug);
        expect(warnings).toHaveLength(2);
        expect(warnings.some(w => w.includes('"a"'))).toBe(true);
        expect(warnings.some(w => w.includes('"b"'))).toBe(true);
    });
});
