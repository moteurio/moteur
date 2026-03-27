import { Router } from 'express';
import type { PluginRouteContext } from '@moteurio/types/Plugin.js';

export function createAnalyseRouter(_ctx: PluginRouteContext): Router {
    const router = Router();
    router.post('/image', (_req, res) => {
        res.status(501).json({ error: 'Analyse image: implement in plugin' });
    });
    return router;
}
