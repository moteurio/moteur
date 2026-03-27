import { describe, expect, it } from 'vitest';
import { analyseImage } from '../src/imageAnalysis.js';
import type { MoteurAIAdapter } from '../src/types.js';

describe('imageAnalysis', () => {
    it('runs alt+caption prompts and trims output', async () => {
        const adapter: MoteurAIAdapter = {
            generate: async () => '',
            analyseImage: async (_url, prompt) => {
                if (prompt.includes('alt text')) return '  Alt text response   ';
                return '  Caption response  ';
            }
        };

        const result = await analyseImage(adapter, 'http://img/1.png', {
            locale: 'fr',
            modelLabel: 'Article',
            entryTitle: 'Test',
            categoryName: 'News'
        });

        expect(result).toEqual({
            alt: 'Alt text response',
            caption: 'Caption response'
        });
    });

    it('throws when adapter does not support analyseImage', async () => {
        const adapter: MoteurAIAdapter = { generate: async () => '' };
        await expect(analyseImage(adapter, 'http://img/1.png', { locale: 'en' })).rejects.toThrow(
            'Adapter does not support image analysis'
        );
    });
});
