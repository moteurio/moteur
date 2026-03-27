import { Router } from 'express';
import { createEntryRouter } from './entry.js';
import { createFieldRouter } from './field.js';
import type { PluginRouteContext } from '@moteurio/types/Plugin.js';

export function createTranslateRouter(ctx: PluginRouteContext): Router {
    const router = Router();
    router.use('/entry', createEntryRouter(ctx));
    router.use('/field', createFieldRouter(ctx));
    return router;
}
