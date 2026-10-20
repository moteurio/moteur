import type { Request, Response } from 'express';
import { Router } from 'express';
import { requireProjectAdmin } from '../middlewares/auth.js';
import { deleteProject } from '@moteurio/core/projects.js';
import type { OpenAPIV3 } from 'openapi-types';
import { sendApiError } from '../utils/apiError.js';

const router: Router = Router();

router.delete('/:projectId', requireProjectAdmin, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;

    try {
        await deleteProject(req.user!, projectId);
        return void res.status(204).send();
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}': {
        delete: {
            summary: 'Delete a project',
            description: 'Project admins only. The project moves to the trash.',
            tags: ['Projects'],
            parameters: [
                {
                    name: 'projectId',
                    in: 'path',
                    required: true,
                    schema: { type: 'string' }
                }
            ],
            responses: {
                '204': {
                    description: 'Project deleted successfully'
                },
                '404': {
                    description: 'Project not found',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    error: { type: 'string' }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
};

export default router;
