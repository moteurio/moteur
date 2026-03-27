import { describe, it, expect } from 'vitest';
import {
    mergeAdapterConfigPreservingSecrets,
    mergeVideoProvidersPayload,
    validateMergedVideoProviders
} from '../../src/assets/mediaSettings.js';

describe('mergeAdapterConfigPreservingSecrets', () => {
    it('applies new non-credential values', () => {
        const out = mergeAdapterConfigPreservingSecrets(
            { bucket: 'old', secretAccessKey: 'sec' },
            { bucket: 'new', secretAccessKey: '' }
        );
        expect(out?.bucket).toBe('new');
        expect(out?.secretAccessKey).toBe('sec');
    });

    it('applies new secrets when provided', () => {
        const out = mergeAdapterConfigPreservingSecrets(
            { secretAccessKey: 'old' },
            { secretAccessKey: 'fresh' }
        );
        expect(out?.secretAccessKey).toBe('fresh');
    });

    it('treats *** as preserve', () => {
        const out = mergeAdapterConfigPreservingSecrets(
            { accessKeyId: 'AKIA', secretAccessKey: 'x' },
            { accessKeyId: '***', secretAccessKey: '' }
        );
        expect(out?.accessKeyId).toBe('AKIA');
        expect(out?.secretAccessKey).toBe('x');
    });
});

describe('mergeVideoProvidersPayload', () => {
    it('clears providers when active unset', () => {
        const out = mergeVideoProvidersPayload(
            { active: 'mux', mux: { tokenId: 'a', tokenSecret: 'b', webhookSecret: 'c' } },
            { active: undefined, keepLocalCopy: true }
        );
        expect(out?.active).toBeUndefined();
        expect(out?.mux).toBeUndefined();
    });

    it('preserves mux secrets when incoming empty', () => {
        const out = mergeVideoProvidersPayload(
            {
                active: 'mux',
                mux: { tokenId: 'id', tokenSecret: 'sec', webhookSecret: 'wh' }
            },
            {
                active: 'mux',
                mux: { tokenId: 'id', tokenSecret: '', webhookSecret: '' }
            }
        );
        expect(out?.mux?.tokenSecret).toBe('sec');
        expect(out?.mux?.webhookSecret).toBe('wh');
    });
});

describe('validateMergedVideoProviders', () => {
    it('passes when no active provider', () => {
        expect(() => validateMergedVideoProviders(undefined)).not.toThrow();
        expect(() => validateMergedVideoProviders({})).not.toThrow();
    });

    it('requires mux fields', () => {
        expect(() =>
            validateMergedVideoProviders({
                active: 'mux',
                mux: { tokenId: '', tokenSecret: 'a', webhookSecret: 'b' }
            })
        ).toThrow(/Token ID/);
    });

    it('requires vimeo fields', () => {
        expect(() =>
            validateMergedVideoProviders({
                active: 'vimeo',
                vimeo: { accessToken: '', webhookSecret: 'x' }
            })
        ).toThrow(/Access token/);
    });

    it('requires cloudflare stream fields', () => {
        expect(() =>
            validateMergedVideoProviders({
                active: 'cloudflare-stream',
                cloudflareStream: { accountId: '', apiToken: 't', webhookSecret: 'w' }
            })
        ).toThrow(/Account ID/);
    });

    it('requires youtube fields', () => {
        expect(() =>
            validateMergedVideoProviders({
                active: 'youtube',
                youtube: { clientId: 'a', clientSecret: '', refreshToken: 'r' }
            })
        ).toThrow(/Client secret/);
    });
});
