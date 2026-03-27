/**
 * AI provider registry — plugins register adapter factories by provider id.
 * getAdapterFromEnv() uses this to create the adapter when MOTEUR_AI_PROVIDER is set.
 */

import type { MoteurAIAdapter } from './types.js';

export type AIProviderFactory = (apiKey: string) => Promise<MoteurAIAdapter> | MoteurAIAdapter;

const providerFactories = new Map<string, AIProviderFactory>();

export function registerAIProvider(providerId: string, factory: AIProviderFactory): void {
    providerFactories.set(providerId.toLowerCase(), factory);
}

export function getAIProviderFactory(providerId: string): AIProviderFactory | undefined {
    return providerFactories.get(providerId.toLowerCase());
}

export function hasAIProvider(providerId: string): boolean {
    return providerFactories.has(providerId.toLowerCase());
}
