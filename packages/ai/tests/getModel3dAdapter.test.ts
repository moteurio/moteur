import { afterEach, describe, expect, it, vi } from 'vitest';

describe('getModel3dAdapter', () => {
    const prevMeshy = process.env.MESHY_API_KEY;
    const prevFal = process.env.FAL_KEY;

    afterEach(() => {
        vi.resetModules();
        if (prevMeshy === undefined) delete process.env.MESHY_API_KEY;
        else process.env.MESHY_API_KEY = prevMeshy;
        if (prevFal === undefined) delete process.env.FAL_KEY;
        else process.env.FAL_KEY = prevFal;
    });

    it('throws when model3dProvider is null', async () => {
        const mod = await import('../src/getModel3dAdapter.js');
        await expect(mod.getModel3dAdapter({ model3dProvider: null })).rejects.toMatchObject({
            code: 'model3d_provider_not_configured'
        });
    });

    it('returns meshy adapter when registered', async () => {
        process.env.MESHY_API_KEY = 'meshy-key';
        const registry = await import('../src/providerRegistry.js');
        const factory = vi.fn(() => ({ generateModel3d: async () => [] }));
        registry.registerAIProvider('meshy', factory);
        const mod = await import('../src/getModel3dAdapter.js');
        await mod.getModel3dAdapter({ model3dProvider: 'meshy' });
        expect(factory).toHaveBeenCalledWith('meshy-key');
    });

    it('returns fal adapter for 3d when fal is registered', async () => {
        process.env.FAL_KEY = 'fal-key';
        const registry = await import('../src/providerRegistry.js');
        const falFactory = vi.fn(() => ({ generateModel3d: async () => [] }));
        registry.registerAIProvider('fal', falFactory);
        const mod = await import('../src/getModel3dAdapter.js');
        await mod.getModel3dAdapter({ model3dProvider: 'fal' });
        expect(falFactory).toHaveBeenCalledWith('fal-key');
    });
});
