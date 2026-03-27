/**
 * @moteurio/ai — provider-agnostic AI layer for Moteur.
 * Types, adapters (OpenAI, Anthropic, Mock), credits, and getAdapter/setAdapter.
 */

export type {
    CreditBalance,
    MoteurAIContext,
    GenerateOptions,
    ImageGenerateOptions,
    ImageResult,
    MoteurAIAdapter
} from './types.js';

export { getAdapter, setAdapter } from './adapter.js';
import { setAdapter } from './adapter.js';
export { getAdapterFromEnv, clearAdapterCache } from './getAdapter.js';
import { getAdapterFromEnv } from './getAdapter.js';
export { registerAIProvider, getAIProviderFactory, hasAIProvider } from './providerRegistry.js';
export type { AIProviderFactory } from './providerRegistry.js';
export { getCredits, deductCredits, setCredits, isAiCreditsDisabled } from './credits.js';
export { getCreditCost, DEFAULT_CREDIT_COSTS, resetCreditCostOverrides } from './creditCosts.js';
export { MockAdapter } from './providers/MockAdapter.js';
export { AIError, NotImplementedError } from './errors.js';
export type { AIErrorCode, AIErrorDetails } from './errors.js';
export { getImageAdapter } from './getImageAdapter.js';
export type { ProjectAISettings } from './getImageAdapter.js';
export { generateImages } from './imageGeneration.js';
export type {
    GenerationRequest,
    GenerationResult,
    GeneratedImage,
    StyleHint
} from './imageGeneration.js';
export { analyseImage } from './imageAnalysis.js';
export type { ImageAnalysisContext, ImageAnalysisResult } from './imageAnalysis.js';
export { runWritingAction } from './writing.js';
export type { WritingAction, FieldMeta } from './writing.js';
export { translateField, translateBlockArray, translateEntry } from './translation.js';
export type {
    TranslatableFieldType,
    RichTextValue,
    Block,
    EntryData,
    ModelSchemaLike
} from './translation.js';

export { createAiRouter, getAiOpenApiPaths } from './routes/index.js';

/**
 * Initialize the global AI adapter from env (MOTEUR_AI_PROVIDER, etc.).
 * Call once at server startup so /ai routes can use getAdapter().
 */
export async function initAiFromEnv(): Promise<void> {
    try {
        const adapter = await getAdapterFromEnv();
        setAdapter(adapter);
    } catch {
        setAdapter(null);
    }
}
