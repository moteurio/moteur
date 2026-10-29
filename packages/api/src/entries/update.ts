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
import { entryVersion } from '@moteurio/core/utils/entryVersion.js';

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
    let version: string;
    try {
        const current = await getEntry(req.user!, projectId, modelId, entryId);
        version = entryVersion(current);
        const ifMatch = req.get('If-Match');
        if (ifMatch && ifMatch !== '*' && ifMatch !== `"${version}"`) {
            return void res.status(412).json({
                error: 'This entry changed. Reload it before saving again.',
                code: 'ENTRY_CONFLICT'
            });
        }
        merged = mergeEntryPatch(current, req.body ?? {}, getCoreIdFieldIds(modelSchema));
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
    // Until an entry is live, required fields may be empty; review and publishing check them.
    const validation = await validateEntry(projectId, merged, modelSchema, {
        projectLocales: projectLocales?.length ? projectLocales : undefined,
        allowHtmlIframe: proj?.allowHtmlIframe === true,
        allowHtmlEmbed: proj?.allowHtmlEmbed === true,
        draft: (merged.status ?? 'draft') !== 'published'
    });

    if (!validation.valid) {
        return void res.status(400).json({
            valid: false,
            // What stops the save; a draft's empty required fields are only warnings.
            errors: validation.issues
                .filter((issue: any) => issue.type === 'error')
                .map((issue: any) => ({
                    field: issue.path,
                    message: issue.message
                }))
        });
    }

    try {
        const entry = await updateEntry(req.user!, projectId, modelId, entryId, req.body, {
            expectedVersion: version
        });
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
                'Partial update. Fields in `data` replace the stored value (send null to clear one); fields left out keep their value. Send If-Match with the quoted version from GET to reject stale edits. A concurrent save returns 409; a stale If-Match returns 412.',
            tags: ['Entries'],
            parameters: [
                {
                    name: 'If-Match',
                    in: 'header',
                    schema: { type: 'string' },
                    description: 'Quoted authoring version from GET'
                },
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
                '409': { description: 'Entry changed during validation; reload and retry' },
                '412': {
                    description: 'The supplied version is stale; reload and resolve conflicts'
                },
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
