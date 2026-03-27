import { Router } from 'express';
import type { PluginRouteContext } from '@moteurio/types/Plugin.js';

export function createEntryRouter(_ctx: PluginRouteContext): Router {
    const router = Router({ mergeParams: true });
    router.post('/', (_req, res) => {
        res.status(501).json({ error: 'Translate entry: implement in plugin' });
    });
    return router;
}
