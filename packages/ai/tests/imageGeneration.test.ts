import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateImages } from '../src/imageGeneration.js';
import { setAdapter } from '../src/adapter.js';
import { setCredits } from '../src/credits.js';
import type { MoteurAIContext, MoteurAIAdapter } from '../src/types.js';

describe('imageGeneration', () => {
    const context: MoteurAIContext = {
        projectId: 'proj-img',
        projectName: 'Demo',
        projectLocales: ['en'],
        defaultLocale: 'en',
        credits: { remaining: 1000 }
    };

    afterEach(() => {
        setAdapter(null);
        vi.restoreAllMocks();
    });

    it('throws insufficient_credits before adapter call', async () => {
        setCredits('proj-img', 0);
        await expect(
            generateImages({ prompt: 'A robot' }, context, { imageProvider: 'openai' })
        ).rejects.toMatchObject({ code: 'insufficient_credits' });
    });

    it('assembles prompt, enforces count bounds, and maps variants with provider label', async () => {
        setCredits('proj-img', 1000);
        const generateImage = vi.fn(async (prompt: string, options: any) => {
            expect(prompt).toContain('Style: photographic, editorial');
            expect(options.count).toBe(2); // max bounded
            expect(options.aspectRatio).toBe('16:9');
            return [{ url: 'http://img/1.png', width: 10, height: 20 }];
        });
        const adapter = { generateImage } as MoteurAIAdapter;
        setAdapter(adapter);

        const getImageAdapter = vi
            .spyOn(await import('../src/getImageAdapter.js'), 'getImageAdapter')
            .mockResolvedValue(adapter);

        const result = await generateImages(
            {
                prompt: 'A robot',
                styleHints: ['photographic', 'editorial'],
                count: 99,
                aspectRatio: '16:9'
            },
            context,
            { imageProvider: 'openai' }
        );

        expect(getImageAdapter).toHaveBeenCalled();
        expect(result.variants).toEqual([
            { url: 'http://img/1.png', width: 10, height: 20, provider: 'openai/dall-e-3' }
        ]);
        expect(result.creditsUsed).toBeGreaterThan(0);
    });
});
