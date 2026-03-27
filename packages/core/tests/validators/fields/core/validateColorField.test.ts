import { describe, it, expect } from 'vitest';
import { validateColorField } from '../../../../src/validators/fields/core/validateColorField.js';
import { Field } from '@moteurio/types/Field.js';

describe('validateColorField', () => {
    const field: Field = { type: 'core/color', label: 'Color', options: { allowAlpha: true } };
    const fieldWithoutAlpha: Field = {
        type: 'core/color',
        label: 'Color',
        options: { allowAlpha: false }
    };
    const fieldWithPresets: Field = {
        type: 'core/color',
        label: 'Color',
        options: { allowAlpha: false, presetColors: ['#ff0000', '#00ff00'], allowCustom: false }
    };

    it('validates a proper hex color', () => {
        const issues = validateColorField('#ff0000', field, 'data.color');
        expect(issues).toHaveLength(0);
    });

    it('accepts short hex with alpha when allowAlpha is true', () => {
        const issues = validateColorField('#fffa', field, 'data.color');
        expect(issues).toHaveLength(0);
    });

    it('errors for alpha color when allowAlpha is false', () => {
        const issues = validateColorField('#ff0000ff', fieldWithoutAlpha, 'data.color');
        expect(issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: 'error',
                    code: 'COLOR_INVALID_FORMAT'
                })
            ])
        );
    });

    it('errors for invalid color format', () => {
        const issues = validateColorField('invalid-color', field, 'data.color');
        expect(issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: 'error',
                    code: 'COLOR_INVALID_FORMAT'
                })
            ])
        );
    });

    it('errors if color is not a string', () => {
        const issues = validateColorField(123, field, 'data.color');
        expect(issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: 'COLOR_INVALID_TYPE'
                })
            ])
        );
    });

    it('errors if color not in presetColors when allowCustom is false', () => {
        const issues = validateColorField('#0000ff', fieldWithPresets, 'data.color');
        expect(issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: 'COLOR_INVALID_PRESET'
                })
            ])
        );
    });

    it('accepts color in presetColors when allowCustom is false', () => {
        const issues = validateColorField('#ff0000', fieldWithPresets, 'data.color');
        expect(issues).toHaveLength(0);
    });
});
