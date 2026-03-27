import { afterEach, describe, expect, it, vi } from 'vitest';

describe('getAdapterFromEnv', () => {
    const prevProvider = process.env.MOTEUR_AI_PROVIDER;
    const prevOpenAi = process.env.OPENAI_API_KEY;

    afterEach(() => {
        process.env.MOTEUR_AI_PROVIDER = prevProvider;
        process.env.OPENAI_API_KEY = prevOpenAi;
        vi.restoreAllMocks();
        vi.resetModules();
    });

    it('returns mock adapter when provider=mock', async () => {
        process.env.MOTEUR_AI_PROVIDER = 'mock';
        const mod = await import('../src/getAdapter.js');
        mod.clearAdapterCache();
        const adapter = await mod.getAdapterFromEnv();
        expect(typeof adapter.generate).toBe('function');
    });

    it('uses registered provider factory and caches the adapter', async () => {
        process.env.MOTEUR_AI_PROVIDER = 'openai';
        process.env.OPENAI_API_KEY = 'k1';

        const registry = await import('../src/providerRegistry.js');
        const factory = vi.fn(async () => ({ generate: async () => 'ok' }));
        registry.registerAIProvider('openai', factory);

        const mod = await import('../src/getAdapter.js');
        mod.clearAdapterCache();
        const a1 = await mod.getAdapterFromEnv();
        const a2 = await mod.getAdapterFromEnv();

        expect(factory).toHaveBeenCalledTimes(1);
        expect(a2).toBe(a1);
    });

    it('throws explicit errors for missing provider and missing API key', async () => {
        process.env.MOTEUR_AI_PROVIDER = '';
        let mod = await import('../src/getAdapter.js');
        mod.clearAdapterCache();
        await expect(mod.getAdapterFromEnv()).rejects.toThrow('MOTEUR_AI_PROVIDER is not set');

        vi.resetModules();
        process.env.MOTEUR_AI_PROVIDER = 'openai';
        delete process.env.OPENAI_API_KEY;
        const registry = await import('../src/providerRegistry.js');
        registry.registerAIProvider('openai', async () => ({ generate: async () => 'ok' }));
        mod = await import('../src/getAdapter.js');
        mod.clearAdapterCache();
        await expect(mod.getAdapterFromEnv()).rejects.toThrow('no provider API key is set');
    });
});
