import type { Request, Response } from 'express';
import { Router } from 'express';
import { requireBuilder } from '../middlewares/auth.js';
import {
    getModelSchema,
    updateModelSchema,
    validateModelUrlPattern
} from '@moteurio/core/models.js';
import { validateModel } from '@moteurio/core/validators/validateModel.js';
import type { OpenAPIV3 } from 'openapi-types';
import { sendApiError } from '../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

router.patch('/:modelId', requireBuilder, async (req: Request, res: Response) => {
    const { projectId, modelId } = req.params as Record<string, string>;
    if (!projectId || !modelId) {
        return void res.status(400).json({ error: 'Missing projectId or modelId in path' });
    }

    try {
        // A PATCH may send only what changes (e.g. just `studio`): validate the merged model.
        const current = await getModelSchema(req.user!, projectId, modelId);
        const validation = validateModel({ ...current, ...req.body });
        if (!validation.valid) {
            return void res
                .status(400)
                .json({ validation: validation.issues, error: 'Validation failed' });
        }
        const model = await updateModelSchema(req.user!, projectId, modelId, req.body);
        const urlPatternWarnings =
            req.body.urlPattern !== undefined
                ? validateModelUrlPattern(model.urlPattern, model)
                : undefined;
        return void res.json({
            ...model,
            ...(urlPatternWarnings?.length ? { urlPatternWarnings } : {})
        });
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/models/{modelId}': {
        patch: {
            summary: 'Update a model in a project',
            tags: ['Models'],
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
                        schema: { $ref: '#/components/schemas/UpdateModelInput' }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Model updated successfully',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/Model' }
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
