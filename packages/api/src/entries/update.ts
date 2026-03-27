import type { Request, Response } from 'express';
import { Router } from 'express';
import { updateEntry } from '@moteurio/core/entries.js';
import { getModelSchema } from '@moteurio/core/models.js';
import { validateEntry } from '@moteurio/core/validators/validateEntry.js';
import type { OpenAPIV3 } from 'openapi-types';
import { requireProjectAccess } from '../middlewares/auth.js';
import { getProjectById } from '@moteurio/core/projects.js';
import { sendApiError } from '../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

router.patch('/:entryId', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, modelId, entryId } = req.params;

    if (!projectId || !modelId || !entryId) {
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
        const entry = await updateEntry(req.user!, projectId, modelId, entryId, req.body);
        return void res.json(entry);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/models/{modelId}/entries/{entryId}': {
        patch: {
            summary: 'Update an entry',
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
                },
                {
                    name: 'entryId',
                    in: 'path',
                    required: true,
                    schema: { type: 'string' }
                }
            ],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            additionalProperties: true
                        }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Entry updated',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/Entry' }
                        }
                    }
                },
                '400': {
                    description: 'Validation failed or bad input',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ValidationResult' }
                        }
                    }
                }
            }
        }
    }
};

export default router;
