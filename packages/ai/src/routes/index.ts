/**
 * AI routes — mounted by the API at /ai.
 * All sub-routers receive PluginRouteContext (requireAuth, requireProjectAccess, requireOperator).
 */
import { Router } from 'express';
import { mergePathSpecs } from './mergePathSpecs.js';
import { createStatusRouter, statusOpenapi } from './status.js';
import { createSettingsOverviewRouter, settingsOverviewOpenapi } from './settingsOverview.js';
import { createGenerateImageRouter, generateImageOpenapi } from './generateImage.js';
import { createGenerateAudioRouter, generateAudioOpenapi } from './generateAudio.js';
import { createGenerateModel3dRouter, generateModel3dOpenapi } from './generateModel3d.js';
import { createSaveGeneratedImageRouter } from './saveGeneratedImage.js';
import { createSaveGeneratedModelRouter, saveGeneratedModelOpenapi } from './saveGeneratedModel.js';
import { createGenerateRouter, generateOpenapi } from './generate/index.js';
import { createTranslateRouter } from './translate/index.js';
import { createAssistRouter, assistOpenapi } from './assist.js';
import type { PluginRouteContext } from '@moteurio/types/Plugin.js';

const AI_BASE = '/ai';

function prefixPaths(paths: Record<string, unknown>, prefix: string): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(paths)) {
        out[prefix + key] = value;
    }
    return out;
}

export function createAiRouter(ctx: PluginRouteContext): Router {
    const router = Router();
    router.use(createStatusRouter(ctx));
    // The Studio's helpers (writing, translating a field, describing a picture).
    router.use(createAssistRouter(ctx));
    router.use(createSettingsOverviewRouter(ctx));
    router.use(createGenerateImageRouter(ctx));
    router.use(createGenerateAudioRouter(ctx));
    router.use(createGenerateModel3dRouter(ctx));
    router.use(createSaveGeneratedImageRouter(ctx));
    router.use(createSaveGeneratedModelRouter(ctx));
    router.use('/generate', createGenerateRouter(ctx));
    router.use('/translate', createTranslateRouter(ctx));
    return router;
}

const allPathSpecs = mergePathSpecs(
    statusOpenapi,
    settingsOverviewOpenapi,
    generateImageOpenapi,
    generateAudioOpenapi,
    generateModel3dOpenapi,
    saveGeneratedModelOpenapi,
    generateOpenapi,
    assistOpenapi
);

export function getAiOpenApiPaths(): Record<string, unknown> {
    return prefixPaths(allPathSpecs as Record<string, unknown>, AI_BASE);
}
