import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('getAudioAdapter', () => {
    const prevEleven = process.env.ELEVENLABS_API_KEY;
    const prevFal = process.env.FAL_KEY;

    afterEach(() => {
        vi.resetModules();
        if (prevEleven === undefined) delete process.env.ELEVENLABS_API_KEY;
        else process.env.ELEVENLABS_API_KEY = prevEleven;
        if (prevFal === undefined) delete process.env.FAL_KEY;
        else process.env.FAL_KEY = prevFal;
    });

    it('throws when audioProvider is null', async () => {
        const mod = await import('../src/getAudioAdapter.js');
        await expect(mod.getAudioAdapter({ audioProvider: null })).rejects.toMatchObject({
            code: 'audio_provider_not_configured'
        });
    });

    it('returns elevenlabs adapter when registered', async () => {
        process.env.ELEVENLABS_API_KEY = 'el-key';
        const registry = await import('../src/providerRegistry.js');
        const factory = vi.fn(() => ({ generateAudio: async () => [] }));
        registry.registerAIProvider('elevenlabs', factory);
        const mod = await import('../src/getAudioAdapter.js');
        const adapter = await mod.getAudioAdapter({ audioProvider: 'elevenlabs' });
        expect(factory).toHaveBeenCalledWith('el-key');
        expect(adapter.generateAudio).toBeDefined();
    });

    it('returns fal adapter for audio when fal is registered', async () => {
        process.env.FAL_KEY = 'fal-key';
        const registry = await import('../src/providerRegistry.js');
        const falFactory = vi.fn(() => ({ generateAudio: async () => [] }));
        registry.registerAIProvider('fal', falFactory);
        const mod = await import('../src/getAudioAdapter.js');
        await mod.getAudioAdapter({ audioProvider: 'fal' });
        expect(falFactory).toHaveBeenCalledWith('fal-key');
    });
});
