/**
 * Returns the audio generation adapter for a project.
 */

import type { MoteurAIAdapter } from './types.js';
import { AIError } from './errors.js';
import { getAIProviderFactory } from './providerRegistry.js';

export interface ProjectAudioSettings {
    audioProvider?: 'elevenlabs' | 'fal' | null;
}

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const FAL_KEY = process.env.FAL_KEY;

export async function getAudioAdapter(
    projectSettings: ProjectAudioSettings
): Promise<MoteurAIAdapter> {
    const provider = projectSettings?.audioProvider ?? null;
    if (provider == null) {
        throw new AIError('audio_provider_not_configured');
    }

    if (provider === 'elevenlabs') {
        if (!ELEVENLABS_API_KEY) {
            throw new AIError('audio_provider_not_configured');
        }
        const factory = getAIProviderFactory('elevenlabs');
        if (!factory) {
            throw new AIError('audio_provider_not_configured');
        }
        return Promise.resolve(factory(ELEVENLABS_API_KEY));
    }

    if (provider === 'fal') {
        if (!FAL_KEY) {
            throw new AIError('audio_provider_not_configured');
        }
        const factory = getAIProviderFactory('fal');
        if (!factory) {
            throw new AIError('audio_provider_not_configured');
        }
        return Promise.resolve(factory(FAL_KEY));
    }

    throw new AIError('audio_provider_not_configured');
}
