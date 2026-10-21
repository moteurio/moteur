/**
 * Returns the 3D model generation adapter for a project.
 */

import type { MoteurAIAdapter } from './types.js';
import { AIError } from './errors.js';
import { getAIProviderFactory } from './providerRegistry.js';

export interface ProjectModel3dSettings {
    model3dProvider?: 'meshy' | 'fal' | null;
}

const MESHY_API_KEY = process.env.MESHY_API_KEY;
const FAL_KEY = process.env.FAL_KEY;

export async function getModel3dAdapter(
    projectSettings: ProjectModel3dSettings
): Promise<MoteurAIAdapter> {
    const provider = projectSettings?.model3dProvider ?? null;
    if (provider == null) {
        throw new AIError('model3d_provider_not_configured');
    }

    if (provider === 'meshy') {
        if (!MESHY_API_KEY) {
            throw new AIError('model3d_provider_not_configured');
        }
        const factory = getAIProviderFactory('meshy');
        if (!factory) {
            throw new AIError('model3d_provider_not_configured');
        }
        return Promise.resolve(factory(MESHY_API_KEY));
    }

    if (provider === 'fal') {
        if (!FAL_KEY) {
            throw new AIError('model3d_provider_not_configured');
        }
        const factory = getAIProviderFactory('fal');
        if (!factory) {
            throw new AIError('model3d_provider_not_configured');
        }
        return Promise.resolve(factory(FAL_KEY));
    }

    throw new AIError('model3d_provider_not_configured');
}
