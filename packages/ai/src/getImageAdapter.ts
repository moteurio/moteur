/**
 * Returns the image generation adapter for a project.
 * Separate from getAdapter() because the project may use a different provider
 * for image generation (e.g. OpenAI for text, OpenAI for images; or fal for images only).
 */

import type { MoteurAIAdapter } from './types.js';
import { AIError } from './errors.js';
import { getAIProviderFactory } from './providerRegistry.js';
import { createReplicateAdapter } from './providers/ReplicateAdapter.js';

export interface ProjectAISettings {
    imageProvider?: 'openai' | 'fal' | 'replicate' | null;
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FAL_KEY = process.env.FAL_KEY;

/**
 * Returns an adapter that supports generateImage for the given project settings.
 * @throws AIError('image_provider_not_configured') when imageProvider is null/undefined or not supported
 */
export async function getImageAdapter(
    projectSettings: ProjectAISettings
): Promise<MoteurAIAdapter> {
    const provider = projectSettings?.imageProvider ?? null;
    if (provider == null) {
        throw new AIError('image_provider_not_configured');
    }

    if (provider === 'openai') {
        if (!OPENAI_API_KEY) {
            throw new AIError('image_provider_not_configured');
        }
        const factory = getAIProviderFactory('openai');
        if (!factory) {
            throw new AIError('image_provider_not_configured');
        }
        return Promise.resolve(factory(OPENAI_API_KEY));
    }

    if (provider === 'fal') {
        if (!FAL_KEY) {
            throw new AIError('image_provider_not_configured');
        }
        const factory = getAIProviderFactory('fal');
        if (!factory) {
            throw new AIError('image_provider_not_configured');
        }
        return Promise.resolve(factory(FAL_KEY));
    }

    if (provider === 'replicate') {
        return createReplicateAdapter();
    }

    throw new AIError('image_provider_not_configured');
}
