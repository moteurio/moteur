import { describe, it, expect } from 'vitest';
import {
    normalizeAllowedHostInput,
    validateAllowedHostPatterns,
    hostMatchesPattern,
    hostnameMatchesAnyAllowed,
    requestHostMatchesAllowed
} from '../src/apiKeyAllowedHosts.js';

describe('apiKeyAllowedHosts.normalizeAllowedHostInput', () => {
    it('lowercases bare hostname', () => {
        expect(normalizeAllowedHostInput('  Example.COM  ')).toBe('example.com');
    });

    it('extracts host from https URL', () => {
        expect(normalizeAllowedHostInput('https://WWW.Example.com')).toBe('www.example.com');
    });

    it('rejects URL with path', () => {
        expect(() => normalizeAllowedHostInput('https://example.com/foo')).toThrow(
            /path or query/i
        );
    });

    it('rejects wildcard in URL form', () => {
        expect(() => normalizeAllowedHostInput('https://*.example.com')).toThrow(/Wildcard/i);
    });
});

describe('apiKeyAllowedHosts.validateAllowedHostPatterns', () => {
    it('accepts exact and single leading wildcard', () => {
        expect(validateAllowedHostPatterns(['example.com', '*.my-project.vercel.com'])).toEqual([
            'example.com',
            '*.my-project.vercel.com'
        ]);
    });

    it('rejects duplicate', () => {
        expect(() => validateAllowedHostPatterns(['a.com', 'a.com'])).toThrow(/Duplicate/i);
    });

    it('rejects mid-string star', () => {
        expect(() => validateAllowedHostPatterns(['foo.*.com'])).toThrow(/Invalid wildcard/i);
    });

    it('rejects multiple stars', () => {
        expect(() => validateAllowedHostPatterns(['*.*.com'])).toThrow(/Invalid wildcard/i);
    });
});

describe('apiKeyAllowedHosts.hostMatchesPattern', () => {
    it('matches exact host', () => {
        expect(hostMatchesPattern('www.example.com', 'www.example.com')).toBe(true);
        expect(hostMatchesPattern('other.example.com', 'www.example.com')).toBe(false);
    });

    it('matches single label wildcard suffix', () => {
        expect(hostMatchesPattern('foo.my-project.vercel.com', '*.my-project.vercel.com')).toBe(
            true
        );
        expect(hostMatchesPattern('a.b.my-project.vercel.com', '*.my-project.vercel.com')).toBe(
            false
        );
        expect(hostMatchesPattern('my-project.vercel.com', '*.my-project.vercel.com')).toBe(false);
    });
});

describe('apiKeyAllowedHosts.requestHostMatchesAllowed', () => {
    it('allows when patterns empty', () => {
        expect(requestHostMatchesAllowed({}, [])).toEqual({ ok: true });
    });

    it('rejects when patterns set but no origin', () => {
        expect(requestHostMatchesAllowed({}, ['example.com'])).toMatchObject({
            ok: false,
            reason: 'missing_origin'
        });
    });

    it('prefers Origin over Referer', () => {
        const r = requestHostMatchesAllowed(
            {
                origin: 'https://allowed.com',
                referer: 'https://other.com/page'
            },
            ['allowed.com']
        );
        expect(r).toEqual({ ok: true });
    });

    it('uses Referer when Origin missing', () => {
        const r = requestHostMatchesAllowed(
            { referer: 'https://foo.my-project.vercel.com/path?q=1' },
            ['*.my-project.vercel.com']
        );
        expect(r).toEqual({ ok: true });
    });

    it('rejects non-matching host', () => {
        const r = requestHostMatchesAllowed({ origin: 'https://evil.com' }, ['example.com']);
        expect(r).toMatchObject({ ok: false, reason: 'no_match' });
    });
});

describe('hostnameMatchesAnyAllowed', () => {
    it('returns true if any pattern matches', () => {
        expect(hostnameMatchesAnyAllowed('x.example.com', ['other.com', '*.example.com'])).toBe(
            true
        );
    });
});
