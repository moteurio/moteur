import type { Request, Response } from 'express';
import { Router } from 'express';
import type { ProjectSchema } from '@moteurio/types/Project.js';
import { requireOperator } from '../middlewares/auth.js';
import { getProject, applyProjectPatch, updateProject } from '@moteurio/core/projects.js';
import { validateProject } from '@moteurio/core/validators/validateProject.js';
import type { OpenAPIV3 } from 'openapi-types';
import { sendApiError } from '../utils/apiError.js';

const router: Router = Router();

router.patch('/:projectId', requireOperator, async (req: Request, res: Response) => {
    const { projectId } = req.params;
    const patch = req.body as Partial<ProjectSchema>;

    try {
        const current = await getProject(req.user!, projectId);
        const merged = applyProjectPatch(current, patch);
        const validation = validateProject(merged, { existingProjectId: projectId });
        if (!validation.valid) {
            return void res
                .status(400)
                .json({ validation: validation.issues, error: 'Validation failed' });
        }

        const project = await updateProject(req.user!, projectId, patch);
        return void res.json(project);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}': {
        patch: {
            summary: 'Update a project',
            tags: ['Projects'],
            parameters: [
                {
                    name: 'projectId',
                    in: 'path',
                    required: true,
                    schema: { type: 'string' }
                }
            ],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/UpdateProjectInput' }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Project updated',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/Project' }
                        }
                    }
                },
                '400': {
                    description: 'Validation error',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    error: { type: 'string' },
                                    validation: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                path: { type: 'string' },
                                                message: { type: 'string' }
                                            }
                                        }
                                    }
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
