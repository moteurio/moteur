/**
 * Adapter factory — reads MOTEUR_AI_PROVIDER from env, returns the correct adapter.
 * Uses the provider registry (plugins register openai, anthropic, etc.); mock is built-in.
 *
 * Env:
 *   MOTEUR_AI_PROVIDER = 'anthropic' | 'openai' | 'google' | 'fal' | 'mock'
 *   ANTHROPIC_API_KEY / OPENAI_API_KEY / GOOGLE_AI_API_KEY / GEMINI_API_KEY / FAL_KEY
 */

import type { MoteurAIAdapter } from './types.js';
import { getAIProviderFactory } from './providerRegistry.js';
import { MockAdapter } from './providers/MockAdapter.js';

let cachedAdapter: MoteurAIAdapter | null = null;

export async function getAdapterFromEnv(): Promise<MoteurAIAdapter> {
    if (cachedAdapter) return cachedAdapter;

    const provider = (process.env.MOTEUR_AI_PROVIDER ?? '').toLowerCase();
    const apiKey =
        (provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY : null) ??
        (provider === 'openai' ? process.env.OPENAI_API_KEY : null) ??
        (provider === 'google'
            ? (process.env.GOOGLE_AI_API_KEY ?? process.env.GEMINI_API_KEY)
            : null) ??
        (provider === 'fal' ? process.env.FAL_KEY : null);

    if (provider === 'mock') {
        cachedAdapter = new MockAdapter();
        return cachedAdapter;
    }

    const factory = getAIProviderFactory(provider);
    if (factory) {
        if (!apiKey) {
            throw new Error(`MOTEUR_AI_PROVIDER is "${provider}" but no provider API key is set.`);
        }
        cachedAdapter = await Promise.resolve(factory(apiKey));
        return cachedAdapter;
    }

    if (!provider) {
        throw new Error(
            'MOTEUR_AI_PROVIDER is not set. Set it to "anthropic", "openai", "google", "fal", or "mock".'
        );
    }

    throw new Error(
        `Unrecognised MOTEUR_AI_PROVIDER: "${provider}". Use "anthropic", "openai", "google", "fal", or "mock" (register provider plugins for openai, anthropic, google, fal).`
    );
}

/**
 * For tests: reset the cached adapter.
 */
export function clearAdapterCache(): void {
    cachedAdapter = null;
}
