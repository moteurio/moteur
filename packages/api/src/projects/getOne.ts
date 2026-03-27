import type { Request, Response } from 'express';
import { Router } from 'express';
import { requireProjectAccess } from '../middlewares/auth.js';
import { getProject } from '@moteurio/core/projects.js';
import type { OpenAPIV3 } from 'openapi-types';
import { getMessage } from '../utils/apiError.js';

const router: Router = Router();

router.get('/:projectId', requireProjectAccess, async (req: Request, res: Response) => {
    try {
        const { projectId } = req.params;
        const project = await getProject(req.user!, projectId);

        if (!project || !project.id) {
            return void res.status(404).json({ error: 'Project not found' });
        }

        res.status(200).json({ project });
    } catch (err: unknown) {
        res.status(404).json({ error: getMessage(err) || 'Project not found' });
    }
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}': {
        get: {
            summary: 'Get a single project by ID',
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
                '200': {
                    description: 'The requested project',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    project: { $ref: '#/components/schemas/Project' }
                                }
                            }
                        }
                    }
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
