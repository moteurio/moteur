/**
 * Image generation service: prompt assembly, credit deduction, provider call.
 * Uses getImageAdapter(projectSettings) for provider routing.
 */

import type { MoteurAIContext } from './types.js';
import { getImageAdapter, type ProjectAISettings } from './getImageAdapter.js';
import { getCredits, deductCredits } from './credits.js';
import { getCreditCost } from './creditCosts.js';
import { AIError } from './errors.js';

export interface GenerationRequest {
    prompt: string;
    styleHints?: StyleHint[];
    aspectRatio?: '1:1' | '4:3' | '16:9' | '3:2';
    count?: number; // default: 2
}

export type StyleHint =
    | 'photographic'
    | 'illustration'
    | 'technical-diagram'
    | 'editorial'
    | 'abstract';

export interface GenerationResult {
    variants: GeneratedImage[];
    prompt: string;
    creditsUsed: number;
    creditsRemaining: number;
}

export interface GeneratedImage {
    url: string;
    width: number;
    height: number;
    provider: string;
}

function assemblePrompt(editorPrompt: string, styleHints?: StyleHint[]): string {
    const trimmed = editorPrompt.trim();
    if (!styleHints?.length) return trimmed;
    const styleSuffix = `Style: ${styleHints.join(', ')}`;
    return trimmed ? `${trimmed}\n${styleSuffix}` : styleSuffix;
}

function providerLabel(settings: ProjectAISettings): string {
    const p = settings?.imageProvider;
    if (p === 'openai') return 'openai/dall-e-3';
    if (p === 'fal') return 'fal';
    if (p === 'replicate') return 'replicate';
    return 'unknown';
}

export async function generateImages(
    request: GenerationRequest,
    context: MoteurAIContext,
    projectSettings: ProjectAISettings
): Promise<GenerationResult> {
    const cost = getCreditCost('generate.image');
    const balance = getCredits(context.projectId);
    if (balance < cost) {
        throw new AIError('insufficient_credits', {
            required: cost,
            remaining: balance
        });
    }

    const deduct = deductCredits(context.projectId, cost);
    if (!deduct.success) {
        throw new AIError('insufficient_credits', {
            required: cost,
            remaining: deduct.remaining
        });
    }

    const assembledPrompt = assemblePrompt(request.prompt, request.styleHints);
    const count = Math.min(2, Math.max(1, request.count ?? 2));
    const aspectRatio = request.aspectRatio ?? '1:1';

    const adapter = await getImageAdapter(projectSettings);
    if (!adapter.generateImage) {
        throw new AIError('image_provider_not_configured');
    }

    const results = await adapter.generateImage(assembledPrompt, {
        aspectRatio,
        count
    });

    const provider = providerLabel(projectSettings);
    const variants: GeneratedImage[] = (results ?? []).map(r => ({
        url: r.url,
        width: r.width,
        height: r.height,
        provider
    }));

    return {
        variants,
        prompt: assembledPrompt,
        creditsUsed: cost,
        creditsRemaining: getCredits(context.projectId)
    };
}
