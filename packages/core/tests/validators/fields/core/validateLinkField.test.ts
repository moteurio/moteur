import { describe, it, expect } from 'vitest';
import { validateLinkField } from '../../../../src/validators/fields/core/validateLinkField.js';
import type { Field } from '@moteurio/types/Field.js';

const field: Field = { type: 'core/link', label: 'Link' };
const codes = (issues: { code: string }[]) => issues.map(i => i.code);

describe('validateLinkField', () => {
    it('accepts a URL, as a string, in an object, or one per language', () => {
        expect(validateLinkField('/pricing', field, 'x')).toEqual([]);
        expect(
            validateLinkField({ url: 'https://moteur.io', label: 'Moteur' }, field, 'x')
        ).toEqual([]);
        expect(
            validateLinkField({ url: { en: '/pricing', fr: '/fr/tarifs' } }, field, 'x')
        ).toEqual([]);
    });

    it('accepts a link to a page without a URL', () => {
        expect(
            validateLinkField({ pageId: 'pricing', label: { en: 'Pricing' } }, field, 'x')
        ).toEqual([]);
    });

    it('refuses a link with neither', () => {
        expect(codes(validateLinkField({ label: 'Nowhere' }, field, 'x'))).toEqual([
            'LINK_MISSING_URL'
        ]);
    });

    it('refuses an empty page id', () => {
        const issues = validateLinkField({ pageId: ' ' }, field, 'blocks[0].link');
        expect(issues).toEqual([
            expect.objectContaining({ code: 'LINK_INVALID_PAGE', path: 'blocks[0].link.pageId' })
        ]);
    });

    it('warns that a URL beside a page is replaced', () => {
        const issues = validateLinkField({ pageId: 'pricing', url: '/pricing' }, field, 'x');
        expect(issues).toEqual([
            expect.objectContaining({ type: 'warning', code: 'LINK_URL_AND_PAGE' })
        ]);
    });
});
