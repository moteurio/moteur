/**
 * MockAdapter — deterministic output for tests. Never makes network calls.
 */

import type {
    MoteurAIAdapter,
    GenerateOptions,
    ImageGenerateOptions,
    ImageResult
} from '../types.js';

export class MockAdapter implements MoteurAIAdapter {
    generate(prompt: string, _options?: GenerateOptions): Promise<string> {
        return Promise.resolve(`[mock:${prompt.length}chars]`);
    }

    generateStructured<T>(prompt: string, _schema: object, _options?: GenerateOptions): Promise<T> {
        return Promise.resolve({ __mock: true, promptLength: prompt.length } as T);
    }

    embed(text: string): Promise<number[]> {
        const dim = Math.min(64, Math.max(8, Math.floor(text.length / 10)));
        return Promise.resolve(Array.from({ length: dim }, (_, i) => (i + 1) / (dim + 1)));
    }

    analyseImage(_imageUrl: string, prompt: string, _options?: GenerateOptions): Promise<string> {
        return Promise.resolve(`[mock image: ${prompt.slice(0, 30)}]`);
    }

    generateImage(prompt: string, options?: ImageGenerateOptions): Promise<ImageResult[]> {
        const count = options?.count ?? 1;
        return Promise.resolve(
            Array.from({ length: count }, (_, i) => ({
                url: `https://mock.example/img-${i}.png`,
                width: 1024,
                height: 1024,
                prompt
            }))
        );
    }
}
