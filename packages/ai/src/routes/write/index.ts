import { Router } from 'express';
import type { PluginRouteContext } from '@moteurio/types/Plugin.js';

export function createWriteRouter(_ctx: PluginRouteContext): Router {
    const router = Router();
    router.post('/draft', (_req, res) => {
        res.status(501).json({ error: 'Write: implement in plugin' });
    });
    return router;
}
