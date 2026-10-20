/**
 * Audio generation: credit deduction and provider call.
 */

import type { MoteurAIContext } from './types.js';
import { getAudioAdapter, type ProjectAudioSettings } from './getAudioAdapter.js';
import { getCredits, deductCredits } from './credits.js';
import { getCreditCost } from './creditCosts.js';
import { AIError } from './errors.js';

export interface AudioGenerationRequest {
    prompt: string;
    voice?: string;
}

export interface GeneratedAudio {
    audioBase64: string;
    mimeType: string;
    provider: string;
}

export interface AudioGenerationResult {
    variants: GeneratedAudio[];
    prompt: string;
    creditsUsed: number;
    creditsRemaining: number;
}

function providerLabel(settings: ProjectAudioSettings): string {
    const p = settings?.audioProvider;
    if (p === 'elevenlabs') return 'elevenlabs';
    if (p === 'fal') return 'fal/elevenlabs';
    return 'unknown';
}

export async function generateAudio(
    request: AudioGenerationRequest,
    context: MoteurAIContext,
    projectSettings: ProjectAudioSettings
): Promise<AudioGenerationResult> {
    const cost = getCreditCost('generate.audio');
    const balance = getCredits(context.projectId);
    if (balance < cost) {
        throw new AIError('insufficient_credits', {
            required: cost,
            remaining: balance
        });
    }

    const deduct = deductCredits(context.projectId, cost, 'audio.generate');
    if (!deduct.success) {
        throw new AIError('insufficient_credits', {
            required: cost,
            remaining: deduct.remaining
        });
    }

    const prompt = request.prompt.trim();

    const adapter = await getAudioAdapter(projectSettings);
    if (!adapter.generateAudio) {
        throw new AIError('audio_provider_not_configured');
    }

    const results = await adapter.generateAudio(prompt, { voice: request.voice });
    const provider = providerLabel(projectSettings);
    const variants: GeneratedAudio[] = (results ?? []).map(r => ({
        audioBase64: r.audioBase64,
        mimeType: r.mimeType,
        provider
    }));

    return {
        variants,
        prompt,
        creditsUsed: cost,
        creditsRemaining: getCredits(context.projectId)
    };
}
