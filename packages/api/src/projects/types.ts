import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import { projectTypes } from '@moteurio/core/typegen.js';
import { requireProjectAccess } from '../middlewares/auth.js';
import { sendApiError } from '../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

/** The project's content as TypeScript types, for a site reading it (`moteur types`). */
router.get('/', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    try {
        const types = await projectTypes(req.user!, projectId!);
        res.type('text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        return void res.send(types);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/types': {
        get: {
            summary: 'TypeScript types of the content',
            description:
                "One TypeScript file describing what delivery returns for each model, template, block and structure, at any depth. Each type takes a locale mode: 'all' (one value per language) or 'one' (read with `?locale=`).",
            tags: ['Projects'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'The types',
                    content: { 'text/plain': { schema: { type: 'string' } } }
                }
            }
        }
    }
};

export default router;
