import { describe, it, expect } from 'vitest';
import {
    stripUiFromFieldSchema,
    stripUiFromFieldOptions
} from '../../src/utils/stripUiFromFields.js';

describe('stripUiFromFields', () => {
    describe('stripUiFromFieldSchema', () => {
        it('returns schema unchanged when null or undefined', () => {
            expect(stripUiFromFieldSchema(null as any)).toBe(null);
            expect(stripUiFromFieldSchema(undefined as any)).toBe(undefined);
        });

        it('removes ui from optionsSchema', () => {
            const schema = {
                type: 'core/text',
                label: 'Title',
                optionsSchema: {
                    maxLength: { type: 'core/number' },
                    ui: { type: 'core/text', label: 'UI Hint' }
                }
            };
            const result = stripUiFromFieldSchema(schema);
            expect(result.optionsSchema).not.toHaveProperty('ui');
            expect(result.optionsSchema).toHaveProperty('maxLength');
        });

        it('recursively strips ui from nested fields', () => {
            const schema = {
                type: 'core/object',
                fields: {
                    name: {
                        type: 'core/text',
                        optionsSchema: { ui: { type: 'core/text' } }
                    }
                }
            };
            const result = stripUiFromFieldSchema(schema);
            expect(result.fields?.name?.optionsSchema).not.toHaveProperty('ui');
        });

        it('does not mutate original schema', () => {
            const schema = { optionsSchema: { ui: 'textarea' } };
            stripUiFromFieldSchema(schema);
            expect(schema.optionsSchema).toHaveProperty('ui');
        });
    });

    describe('stripUiFromFieldOptions', () => {
        it('returns empty object when options is undefined', () => {
            expect(stripUiFromFieldOptions(undefined)).toEqual({});
        });

        it('removes ui from options', () => {
            const options = { required: true, ui: 'textarea', maxLength: 100 };
            const result = stripUiFromFieldOptions(options);
            expect(result).not.toHaveProperty('ui');
            expect(result).toEqual({ required: true, maxLength: 100 });
        });

        it('returns options unchanged when no ui', () => {
            const options = { required: true, maxLength: 100 };
            expect(stripUiFromFieldOptions(options)).toEqual(options);
        });
    });
});
