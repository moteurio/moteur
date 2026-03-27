import { describe, it, expect } from 'vitest';
import { validateJsonField } from '../../../../src/validators/fields/core/validateJsonField.js';
import { Field } from '@moteurio/types/Field.js';

describe('validateJsonField', () => {
    const field: Field = { type: 'core/json', label: 'Data' };

    it('validates valid JSON object', () => {
        expect(validateJsonField({ a: 1 }, field, 'data.json')).toEqual([]);
    });

    it('validates valid JSON string', () => {
        expect(validateJsonField('{"a":1}', field, 'data.json')).toEqual([]);
    });

    it('returns error for invalid JSON string', () => {
        const issues = validateJsonField('{invalid}', field, 'data.json');
        expect(issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: 'JSON_INVALID',
                    message: 'Value is not valid JSON.'
                })
            ])
        );
    });

    it('allows empty when allowEmpty is true', () => {
        const f: Field = { type: 'core/json', label: 'Data', options: { allowEmpty: true } };
        expect(validateJsonField(null, f, 'data.json')).toEqual([]);
        expect(validateJsonField('', f, 'data.json')).toEqual([]);
    });

    it('returns error for null when allowEmpty is false', () => {
        const issues = validateJsonField(null, field, 'data.json');
        expect(issues[0].code).toBe('JSON_EMPTY');
    });

    it('validates against options.schema when set (JSON Schema)', () => {
        const f: Field = {
            type: 'core/json',
            label: 'Data',
            options: {
                schema: {
                    type: 'object',
                    required: ['name'],
                    properties: {
                        name: { type: 'string' }
                    }
                }
            }
        };
        expect(validateJsonField({ name: 'ok' }, f, 'data.json')).toEqual([]);
        const bad = validateJsonField({ age: 1 }, f, 'data.json');
        expect(bad.some(i => i.code === 'JSON_SCHEMA_VIOLATION')).toBe(true);
    });
});
