import type { Request, Response } from 'express';
import { Router } from 'express';
import { getEntry, mergeEntryPatch, updateEntry } from '@moteurio/core/entries.js';
import { getCoreIdFieldIds } from '@moteurio/core/utils/coreIdFields.js';
import { getModelSchema } from '@moteurio/core/models.js';
import { validateEntry } from '@moteurio/core/validators/validateEntry.js';
import type { OpenAPIV3 } from 'openapi-types';
import { requireProjectAccess } from '../middlewares/auth.js';
import { getProjectById } from '@moteurio/core/projects.js';
import { sendApiError } from '../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

router.patch('/:entryId', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, modelId, entryId } = req.params as Record<string, string>;

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
    // Validate the entry as it will be saved: fields left out of a partial update keep their
    // stored value, so required fields don't have to be resent.
    let merged;
    try {
        const current = await getEntry(req.user!, projectId, modelId, entryId);
        merged = mergeEntryPatch(current, req.body ?? {}, getCoreIdFieldIds(modelSchema));
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
    const validation = await validateEntry(projectId, merged, modelSchema, {
        projectLocales: projectLocales?.length ? projectLocales : undefined,
        allowHtmlIframe: proj?.allowHtmlIframe === true,
        allowHtmlEmbed: proj?.allowHtmlEmbed === true
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
            description:
                'Partial update. Fields in `data` replace the stored value (send null to clear one); fields left out keep their value. The resulting entry is validated against the model.',
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
