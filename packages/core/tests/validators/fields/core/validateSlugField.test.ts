import { describe, it, expect } from 'vitest';
import { validateSlugField } from '../../../../src/validators/fields/core/validateSlugField.js';
import { Field } from '@moteurio/types/Field.js';

describe('validateSlugField', () => {
    const singleField: Field = {
        type: 'core/slug',
        label: 'Slug'
    };

    const multilingualField: Field = {
        type: 'core/slug',
        label: 'Slug',
        options: { multilingual: true }
    };

    it('validates a single-language slug', () => {
        const issues = validateSlugField('valid-slug_123', singleField, 'data.slug');
        expect(issues).toEqual([]);
    });

    /*it('errors for empty single-language slug', () => {
    const issues = validateSlugField('', singleField, 'data.slug');
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'SLUG_INVALID_VALUE'
        })
      ])
    );
  });*/

    it('errors for invalid characters in single-language slug', () => {
        const issues = validateSlugField('invalid slug!', singleField, 'data.slug');
        expect(issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: 'SLUG_INVALID_FORMAT'
                })
            ])
        );
    });

    /*it('validates multilingual slugs', () => {
    const value = { en: 'valid-en', fr: 'valide-fr' };
    const issues = validateSlugField(value, multilingualField, 'data.slug');
    expect(issues).toEqual([]);
  });*/

    /*it('errors for invalid multilingual slug format', () => {
    const issues = validateSlugField('not-an-object', multilingualField, 'data.slug');
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'SLUG_INVALID_MULTILINGUAL_FORMAT'
        })
      ])
    );
  });*/

    it('errors for missing multilingual slug values', () => {
        const value = { en: '', fr: 'valid' };
        const issues = validateSlugField(value, multilingualField, 'data.slug');
        expect(issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: 'SLUG_INVALID_VALUE'
                })
            ])
        );
    });

    it('errors for invalid characters in multilingual slugs', () => {
        const value = { en: 'valid-slug', fr: 'invalide slug!' };
        const issues = validateSlugField(value, multilingualField, 'data.slug');
        expect(issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: 'SLUG_INVALID_FORMAT'
                })
            ])
        );
    });
});
