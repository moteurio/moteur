import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyseImage, MockAdapter } from '@moteurio/ai';

describe('imageAnalysis service', () => {
    let adapter: MockAdapter;

    beforeEach(() => {
        adapter = new MockAdapter();
    });

    it('returns alt and caption from adapter in parallel', async () => {
        const result = await analyseImage(adapter, 'https://example.com/img.png', {
            locale: 'en'
        });
        expect(result).toHaveProperty('alt');
        expect(result).toHaveProperty('caption');
        expect(typeof result.alt).toBe('string');
        expect(typeof result.caption).toBe('string');
        expect(result.alt).toContain('[mock image:');
        expect(result.caption).toContain('[mock image:');
    });

    it('includes context in caption prompt when provided', async () => {
        const result = await analyseImage(adapter, 'https://example.com/img.png', {
            locale: 'fr',
            modelLabel: 'Article',
            entryTitle: 'My Post',
            categoryName: 'News'
        });
        expect(result.caption).toBeDefined();
    });

    it('trims alt to 125 chars', async () => {
        vi.spyOn(adapter, 'analyseImage').mockResolvedValue('x'.repeat(200));
        const result = await analyseImage(adapter, 'https://example.com/img.png', {
            locale: 'en'
        });
        expect(result.alt.length).toBeLessThanOrEqual(125);
    });

    it('throws when adapter has no analyseImage', async () => {
        const noVision = { generate: adapter.generate.bind(adapter) } as any;
        await expect(
            analyseImage(noVision, 'https://example.com/img.png', { locale: 'en' })
        ).rejects.toThrow('does not support');
    });
});
