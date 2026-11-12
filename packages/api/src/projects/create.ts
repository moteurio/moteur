import type { Request, Response } from 'express';
import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { createProjectFromBlueprint } from '@moteurio/core/projects.js';
import { validateProject } from '@moteurio/core/validators/validateProject.js';
import { redactProjectSecrets } from '@moteurio/core/assets/mediaSettings.js';
import type { OpenAPIV3 } from 'openapi-types';
import { sendApiError } from '../utils/apiError.js';
import { gitRemoteRefusal } from '../utils/gitRemote.js';

const router: Router = Router();

router.post('/', requireAuth, async (req: Request, res: Response) => {
    try {
        const { blueprintId, ...body } = req.body || {};
        delete body.memberRoles;
        // The user creating the project is its first member. Others join by invitation.
        delete body.users;
        const refusal = gitRemoteRefusal(body.git);
        if (refusal) return void res.status(400).json({ error: refusal });
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
        return void res.status(201).json(
            result.project && {
                ...redactProjectSecrets(result.project),
                // The outcome of the blueprint import: completed, or the reason nothing was imported.
                ...(result.blueprint && { fromBlueprint: result.blueprint })
            }
        );
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
                                                'A project blueprint to start from: its bundle is imported into the new project, and the answer says how in `fromBlueprint` (`status`, `issues`). An unknown one is refused (404) before anything is made.'
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
                description: 'A project blueprint to start from (its bundle is imported).'
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
