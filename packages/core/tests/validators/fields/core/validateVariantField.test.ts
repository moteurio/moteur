import { describe, it, expect } from 'vitest';
import '../../../../src/fields/index.js';
import { validateVariantField } from '../../../../src/validators/fields/core/validateVariantField.js';
import { validateFieldValue } from '../../../../src/validators/validateFieldValue.js';
import type { Field } from '@moteurio/types/Field.js';

const exhibit: Field = {
    type: 'core/variant',
    label: 'Exhibit',
    options: {
        variants: {
            image: {
                label: 'Image',
                fields: {
                    src: { type: 'core/text', label: 'Source', options: { required: true } },
                    alt: { type: 'core/text', label: 'Alt text' }
                }
            },
            code: {
                label: 'Code',
                fields: {
                    language: { type: 'core/text', label: 'Language', options: { required: true } },
                    code: { type: 'core/textarea', label: 'Code' }
                }
            }
        }
    }
};

const codes = (issues: { code: string }[]) => issues.map(i => i.code);

describe('validateVariantField', () => {
    it('accepts a value of one of its kinds, flat beside its kind', () => {
        expect(
            validateVariantField(
                { kind: 'image', src: '/inbox.png', alt: 'The inbox' },
                exhibit,
                'x'
            )
        ).toEqual([]);
        expect(validateVariantField({ kind: 'code', language: 'ts' }, exhibit, 'x')).toEqual([]);
    });

    it('is reached through the field registry', () => {
        expect(codes(validateFieldValue({ kind: 'film' }, exhibit, 'x'))).toEqual([
            'VARIANT_UNKNOWN_KIND'
        ]);
    });

    it('refuses an unknown or missing kind', () => {
        const issues = validateVariantField({ kind: 'film' }, exhibit, 'data.exhibit');
        expect(issues).toHaveLength(1);
        expect(issues[0]).toMatchObject({
            code: 'VARIANT_UNKNOWN_KIND',
            path: 'data.exhibit.kind',
            message: '"kind" must be one of: image, code.'
        });
        expect(codes(validateVariantField({ src: 'a.png' }, exhibit, 'x'))).toEqual([
            'VARIANT_UNKNOWN_KIND'
        ]);
    });

    it("checks the chosen kind's fields only", () => {
        const issues = validateVariantField({ kind: 'code', code: 'x' }, exhibit, 'e');
        expect(issues).toEqual([
            expect.objectContaining({ code: 'VARIANT_MISSING_REQUIRED_FIELD', path: 'e.language' })
        ]);
    });

    it('warns about fields left over from another kind', () => {
        const issues = validateVariantField(
            { kind: 'code', language: 'ts', src: '/inbox.png' },
            exhibit,
            'e'
        );
        expect(issues).toEqual([
            expect.objectContaining({
                type: 'warning',
                code: 'VARIANT_UNKNOWN_FIELD',
                path: 'e.src'
            })
        ]);
    });

    it('needs a value unless allowEmpty', () => {
        expect(codes(validateVariantField(null, exhibit, 'x'))).toEqual(['VARIANT_EMPTY']);
        expect(
            validateVariantField(
                undefined,
                { ...exhibit, options: { ...exhibit.options, allowEmpty: true } },
                'x'
            )
        ).toEqual([]);
        expect(codes(validateVariantField('image', exhibit, 'x'))).toEqual([
            'VARIANT_INVALID_TYPE'
        ]);
    });

    it('reports a field whose variants are wrong before any value', () => {
        const without: Field = { type: 'core/variant', label: 'V', options: {} };
        expect(codes(validateVariantField({ kind: 'a' }, without, 'x'))).toEqual([
            'VARIANT_MISSING_VARIANTS'
        ]);
        const bad: Field = {
            type: 'core/variant',
            label: 'V',
            options: {
                variants: {
                    Image: { fields: {} },
                    ok: { fields: { kind: { type: 'core/text', label: 'K' } } }
                },
                default: 'film'
            }
        };
        expect(codes(validateVariantField({ kind: 'ok' }, bad, 'x'))).toEqual([
            'VARIANT_INVALID_KIND',
            'VARIANT_RESERVED_FIELD',
            'VARIANT_UNKNOWN_DEFAULT'
        ]);
    });
});
