import type { Request, Response } from 'express';
import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { createProjectFromBlueprint } from '@moteurio/core/projects.js';
import { validateProject } from '@moteurio/core/validators/validateProject.js';
import type { OpenAPIV3 } from 'openapi-types';
import { sendApiError } from '../utils/apiError.js';

const router: Router = Router();

router.post('/', requireAuth, async (req: Request, res: Response) => {
    try {
        const { blueprintId, ...body } = req.body || {};
        const validation = validateProject(body);
        if (!validation.valid) {
            return void res
                .status(400)
                .json({ validation: validation.issues, error: 'Validation failed' });
        }
        const result = await createProjectFromBlueprint(req.user!, body, blueprintId);
        if (result.validation) {
            return void res
                .status(400)
                .json({ validation: result.validation.issues, error: 'Validation failed' });
        }
        // TODO (optional): send email to creator/owner that a new project was created
        return void res.status(201).json(result.project);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects': {
        post: {
            summary: 'Create a new project',
            tags: ['Projects'],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            allOf: [
                                { $ref: '#/components/schemas/Project' },
                                {
                                    type: 'object',
                                    properties: {
                                        blueprintId: {
                                            type: 'string',
                                            description:
                                                'Optional blueprint id to apply template (models, layouts, structures) to the new project.'
                                        }
                                    }
                                }
                            ]
                        }
                    }
                }
            },
            responses: {
                '201': {
                    description: 'Project successfully created',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/NewProjectInput' }
                        }
                    }
                },
                '400': {
                    description: 'Validation failed or bad input',
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

export const schemas: OpenAPIV3.ComponentsObject['schemas'] = {
    NewProjectInput: {
        type: 'object',
        required: ['id', 'label'],
        properties: {
            id: { type: 'string' },
            label: { type: 'string' },
            description: { type: 'string' },
            defaultLocale: { type: 'string' },
            locale: { type: 'string' },
            blueprintId: {
                type: 'string',
                description: 'Optional blueprint id to apply template to the new project.'
            },
            modules: {
                type: 'array',
                items: { type: 'string' }
            },
            plugins: {
                type: 'array',
                items: { type: 'string' }
            }
        }
    }
};

export default router;
