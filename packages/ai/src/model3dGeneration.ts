/**
 * 3D model generation: credit deduction and provider call.
 */

import type { MoteurAIContext } from './types.js';
import { getModel3dAdapter, type ProjectModel3dSettings } from './getModel3dAdapter.js';
import { getCredits, deductCredits } from './credits.js';
import { getCreditCost } from './creditCosts.js';
import { AIError } from './errors.js';

export interface Model3dGenerationRequest {
    prompt: string;
    textured?: boolean;
    format?: 'glb' | 'fbx' | 'obj' | 'usdz';
}

export interface GeneratedModel3d {
    url: string;
    format: string;
    thumbnailUrl?: string;
    provider: string;
}

export interface Model3dGenerationResult {
    variants: GeneratedModel3d[];
    prompt: string;
    creditsUsed: number;
    creditsRemaining: number;
}

function providerLabel(settings: ProjectModel3dSettings): string {
    const p = settings?.model3dProvider;
    if (p === 'meshy') return 'meshy';
    if (p === 'fal') return 'fal/meshy';
    return 'unknown';
}

export async function generateModels3d(
    request: Model3dGenerationRequest,
    context: MoteurAIContext,
    projectSettings: ProjectModel3dSettings
): Promise<Model3dGenerationResult> {
    const cost = getCreditCost('generate.model3d');
    const balance = getCredits(context.projectId);
    if (balance < cost) {
        throw new AIError('insufficient_credits', {
            required: cost,
            remaining: balance
        });
    }

    const deduct = deductCredits(context.projectId, cost, 'model3d.generate');
    if (!deduct.success) {
        throw new AIError('insufficient_credits', {
            required: cost,
            remaining: deduct.remaining
        });
    }

    const prompt = request.prompt.trim();

    const adapter = await getModel3dAdapter(projectSettings);
    if (!adapter.generateModel3d) {
        throw new AIError('model3d_provider_not_configured');
    }

    const results = await adapter.generateModel3d(prompt, {
        textured: request.textured,
        format: request.format
    });

    const provider = providerLabel(projectSettings);
    const variants: GeneratedModel3d[] = (results ?? []).map(r => ({
        url: r.url,
        format: r.format,
        thumbnailUrl: r.thumbnailUrl,
        provider
    }));

    return {
        variants,
        prompt,
        creditsUsed: cost,
        creditsRemaining: getCredits(context.projectId)
    };
}
