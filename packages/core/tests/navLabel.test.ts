import { describe, expect, it } from 'vitest';
import { navLabelForLocale } from '../src/navigations.js';

describe('navLabelForLocale', () => {
    it('returns a plain string for every language', () => {
        expect(navLabelForLocale('Journal', 'en', 'fr')).toBe('Journal');
    });

    it('returns the asked language, then the project default', () => {
        const label = { fr: 'Numéros', en: 'Issues' };
        expect(navLabelForLocale(label, 'en', 'fr')).toBe('Issues');
        expect(navLabelForLocale(label, 'de', 'fr')).toBe('Numéros');
        expect(navLabelForLocale({ en: '' }, 'en', 'fr')).toBe('');
    });
});
