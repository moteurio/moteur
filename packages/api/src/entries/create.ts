import type { Request, Response } from 'express';
import { Router } from 'express';
import { createEntry } from '@moteurio/core/entries.js';
import { validateEntry } from '@moteurio/core/validators/validateEntry.js';
import type { OpenAPIV3 } from 'openapi-types';
import { getModelSchema } from '@moteurio/core/models.js';
import { getProjectById } from '@moteurio/core/projects.js';
import { requireProjectAccess } from '../middlewares/auth.js';
import { sendApiError } from '../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

const handler = async (req: Request, res: Response) => {
    const { projectId, modelId } = req.params;

    if (!projectId || !modelId) {
        return void res.status(400).json({ error: 'Missing path parameters' });
    }

    const modelSchema = await getModelSchema(req.user!, projectId, modelId);
    if (!modelSchema) {
        return void res.status(404).json({ error: 'Model not found' });
    }

    const proj = await getProjectById(projectId);
    const projectLocales = proj
        ? ([proj.defaultLocale, ...(proj.supportedLocales ?? [])].filter(Boolean) as string[])
        : undefined;
    const validation = await validateEntry(projectId, req.body, modelSchema, {
        projectLocales: projectLocales?.length ? projectLocales : undefined
    });
    if (!validation.valid) {
        return void res.status(400).json({
            valid: false,
            errors: validation.issues.map((issue: any) => ({
                field: issue.path,
                message: issue.message
            }))
        });
    }

    try {
        const entry = await createEntry(req.user!, projectId, modelId, req.body);
        return void res.status(201).json(entry);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
};

router.post('/', requireProjectAccess, handler);

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/models/{modelId}/entries': {
        post: {
            summary: 'Create a new entry',
            tags: ['Entries'],
            parameters: [
                {
                    name: 'projectId',
                    in: 'path',
                    required: true,
                    schema: { type: 'string' }
                },
                {
                    name: 'modelId',
                    in: 'path',
                    required: true,
                    schema: { type: 'string' }
                }
            ],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/EntryCreateBody' }
                    }
                }
            },
            responses: {
                '201': {
                    description: 'Entry created',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/Entry' }
                        }
                    }
                },
                '400': {
                    description: 'Schema validation failed (issues in body)',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    valid: { type: 'boolean' },
                                    errors: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                field: { type: 'string' },
                                                message: { type: 'string' }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                '404': {
                    description: 'Model not found',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                },
                '409': {
                    description: 'Conflict (e.g. entry id already exists)',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                },
                '500': {
                    description: 'Unexpected server error',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                }
            }
        }
    }
};

export default router;
