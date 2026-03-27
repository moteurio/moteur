import { describe, it, expect } from 'vitest';
import {
    registerAIProvider,
    getAIProviderFactory,
    hasAIProvider
} from '../src/providerRegistry.js';

describe('providerRegistry', () => {
    it('registers providers case-insensitively and resolves with any casing', async () => {
        registerAIProvider('MockX', async () => ({
            generate: async () => 'ok'
        }));

        expect(hasAIProvider('mockx')).toBe(true);
        expect(hasAIProvider('MOCKX')).toBe(true);

        const factory = getAIProviderFactory('mOcKx');
        expect(factory).toBeDefined();
        const adapter = await factory!('key');
        await expect(adapter.generate('hello')).resolves.toBe('ok');
    });

    it('returns undefined for unknown providers', () => {
        expect(getAIProviderFactory('missing-provider')).toBeUndefined();
        expect(hasAIProvider('missing-provider')).toBe(false);
    });
});
