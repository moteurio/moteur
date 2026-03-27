import { Router } from 'express';
import { mergePathSpecs } from '../mergePathSpecs.js';
import { createEntryRouter, entryOpenapi } from './entry.js';
import { createFieldsRouter, fieldsOpenapi } from './fields.js';
import { createImageRouter } from './image.js';
import type { PluginRouteContext } from '@moteurio/types/Plugin.js';

export function createGenerateRouter(ctx: PluginRouteContext): Router {
    const router = Router();
    router.use('/entry', createEntryRouter(ctx));
    router.use('/fields', createFieldsRouter(ctx));
    router.use('/image', createImageRouter(ctx));
    return router;
}

export const generateOpenapi = mergePathSpecs(entryOpenapi, fieldsOpenapi);
