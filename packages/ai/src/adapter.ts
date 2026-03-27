/**
 * AI adapter — provider-agnostic getter. Returns an adapter that implements
 * MoteurAIAdapter. AI is enabled only when MOTEUR_AI_PROVIDER is set; otherwise
 * returns null (API returns 5xx, Studio hides AI UI).
 */

import type { MoteurAIAdapter } from './types.js';
import { getAdapterFromEnv, clearAdapterCache } from './getAdapter.js';

let cachedAdapter: MoteurAIAdapter | null = null;

/**
 * Returns the configured AI adapter when MOTEUR_AI_PROVIDER is set; otherwise null.
 * No fallback: if no provider is configured, AI is disabled.
 */
export async function getAdapter(): Promise<MoteurAIAdapter | null> {
    if (cachedAdapter) return cachedAdapter;
    if (!process.env.MOTEUR_AI_PROVIDER) return null;
    try {
        cachedAdapter = await getAdapterFromEnv();
        return cachedAdapter;
    } catch {
        return null;
    }
}

/**
 * For tests: inject a mock adapter. Clears the factory cache so the next
 * getAdapter() (if not using env) can create a new one.
 */
export function setAdapter(adapter: MoteurAIAdapter | null): void {
    cachedAdapter = adapter;
    clearAdapterCache();
}
