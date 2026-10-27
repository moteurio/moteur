import { describe, expect, it } from 'vitest';
import { submissionSource } from '../src/submissionSource.js';

describe('where a form was sent from', () => {
    it('keeps the page, the referrer and the campaign from the page’s utm parameters', () => {
        expect(
            submissionSource({
                page: 'https://site.test/contact?utm_source=newsletter&utm_medium=email&utm_campaign=spring#form',
                referrer: 'https://www.google.com/',
                refererHeader: 'https://site.test/'
            })
        ).toEqual({
            page: 'https://site.test/contact?utm_source=newsletter&utm_medium=email&utm_campaign=spring',
            referrer: 'https://www.google.com/',
            campaign: { source: 'newsletter', medium: 'email', campaign: 'spring' }
        });
    });

    it('falls back on the browser’s Referer, and drops what isn’t a web address', () => {
        expect(
            submissionSource({
                page: 'javascript:alert(1)',
                referrer: 'not a url',
                refererHeader: 'https://user:pass@site.test/'
            })
        ).toEqual({ page: 'https://site.test/' });
        expect(submissionSource({})).toEqual({});
    });
});
