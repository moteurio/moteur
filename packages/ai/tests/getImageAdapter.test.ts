import { afterEach, describe, expect, it, vi } from 'vitest';

describe('getImageAdapter', () => {
    const prevOpenAi = process.env.OPENAI_API_KEY;
    const prevFal = process.env.FAL_KEY;

    afterEach(() => {
        if (prevOpenAi === undefined) delete process.env.OPENAI_API_KEY;
        else process.env.OPENAI_API_KEY = prevOpenAi;
        if (prevFal === undefined) delete process.env.FAL_KEY;
        else process.env.FAL_KEY = prevFal;
        vi.restoreAllMocks();
        vi.resetModules();
    });

    it('throws image_provider_not_configured when provider is missing', async () => {
        const mod = await import('../src/getImageAdapter.js');
        await expect(mod.getImageAdapter({ imageProvider: null })).rejects.toMatchObject({
            code: 'image_provider_not_configured'
        });
    });

    it('resolves openai adapter via registered provider factory', async () => {
        process.env.OPENAI_API_KEY = 'openai-key';
        const registry = await import('../src/providerRegistry.js');
        const factory = vi.fn(async () => ({ generateImage: async () => [] }));
        registry.registerAIProvider('openai', factory);

        const mod = await import('../src/getImageAdapter.js');
        const adapter = await mod.getImageAdapter({ imageProvider: 'openai' });

        expect(factory).toHaveBeenCalledWith('openai-key');
        expect(typeof adapter.generateImage).toBe('function');
    });

    it('returns replicate adapter and uses fal key path when provider=fal', async () => {
        process.env.FAL_KEY = 'fal-key';
        const registry = await import('../src/providerRegistry.js');
        const falFactory = vi.fn(async () => ({ generateImage: async () => [] }));
        registry.registerAIProvider('fal', falFactory);

        const mod = await import('../src/getImageAdapter.js');
        await mod.getImageAdapter({ imageProvider: 'fal' });
        expect(falFactory).toHaveBeenCalledWith('fal-key');

        const replicate = await mod.getImageAdapter({ imageProvider: 'replicate' });
        expect(typeof replicate.generateImage).toBe('function');
    });
});
