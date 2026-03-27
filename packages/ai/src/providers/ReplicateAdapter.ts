/**
 * ReplicateAdapter — stub for Replicate image generation.
 * All methods throw NotImplementedError; implement in a later prompt.
 */

import type { MoteurAIAdapter, ImageGenerateOptions, ImageResult } from '../types.js';
import { NotImplementedError } from '../errors.js';

export async function createReplicateAdapter(): Promise<MoteurAIAdapter> {
    const notImpl = (method: string) => () => {
        throw new NotImplementedError(`ReplicateAdapter.${method} is not implemented yet.`);
    };
    return {
        generate: notImpl('generate'),
        generateStructured: notImpl('generateStructured') as any,
        embed: notImpl('embed'),
        analyseImage: notImpl('analyseImage'),
        generateImage: notImpl('generateImage') as (
            prompt: string,
            options?: ImageGenerateOptions
        ) => Promise<ImageResult[]>
    };
}
