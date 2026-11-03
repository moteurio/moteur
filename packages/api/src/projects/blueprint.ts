import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import { applyBlueprintToProject } from '@moteurio/core/projects.js';
import { requireProjectAdmin } from '../middlewares/auth.js';
import { sendApiError } from '../utils/apiError.js';

const router: Router = Router();

/** A blueprint's content, added to an empty project made without it. */
router.post('/:projectId/blueprint', requireProjectAdmin, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    const blueprintId = typeof req.body?.blueprintId === 'string' ? req.body.blueprintId : '';
    if (!blueprintId)
        return void res.status(400).json({ error: 'Which blueprint? Send blueprintId.' });
    try {
        res.json({
            fromBlueprint: await applyBlueprintToProject(req.user!, projectId, blueprintId)
        });
    } catch (err: unknown) {
        sendApiError(res, req, err);
    }
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/blueprint': {
        post: {
            summary: 'Add a blueprint’s content to an empty project',
            description:
                'What `POST /projects` with `blueprintId` does for a new project, for one made without it: the blueprint’s bundle, fitted to the project’s languages, imported as part of making it (outside its plan’s limits). Only an empty project takes one (no templates, models or pages): otherwise 409 `PROJECT_NOT_EMPTY`, and nothing changes. An unknown blueprint is a 404 `BLUEPRINT_NOT_FOUND`.',
            tags: ['Projects'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            required: ['blueprintId'],
                            properties: { blueprintId: { type: 'string', example: 'site' } }
                        }
                    }
                }
            },
            responses: {
                '200': {
                    description:
                        '`{ fromBlueprint: { id, status, issues, notes? } }`, as `POST /projects` answers it',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    fromBlueprint: { type: 'object', additionalProperties: true }
                                }
                            }
                        }
                    }
                },
                '404': { description: 'No such blueprint' },
                '409': { description: 'The project already has content' }
            }
        }
    }
};

export default router;
