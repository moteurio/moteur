import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import {
    getEntry,
    getEntryAtRevision,
    getEntryRevisions,
    restoreEntryAtRevision
} from '@moteurio/core/entries.js';
import { getModelSchema } from '@moteurio/core/models.js';
import { getProjectById } from '@moteurio/core/projects.js';
import { validateEntry } from '@moteurio/core/validators/validateEntry.js';
import { requireProjectAccess } from '../middlewares/auth.js';
import { sendApiError } from '../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

router.get('/:entryId/revisions', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, modelId, entryId } = req.params as Record<string, string>;
    if (!projectId || !modelId || !entryId) {
        return void res.status(400).json({ error: 'Missing path parameters' });
    }
    try {
        const rawMax = req.query.max;
        const maxStr =
            typeof rawMax === 'string'
                ? rawMax
                : Array.isArray(rawMax) && typeof rawMax[0] === 'string'
                  ? rawMax[0]
                  : '20';
        const max = Math.min(parseInt(maxStr, 10) || 20, 100);
        const revisions = await getEntryRevisions(projectId, modelId, entryId, max);
        return void res.json(revisions);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.get(
    '/:entryId/revisions/:revisionId',
    requireProjectAccess,
    async (req: Request, res: Response) => {
        const { projectId, modelId, entryId, revisionId } = req.params as Record<string, string>;
        if (!projectId || !modelId || !entryId || !revisionId) {
            return void res.status(400).json({ error: 'Missing path parameters' });
        }
        try {
            // Reading the current entry checks the model exists and the user may read it.
            if (!(await getEntry(req.user!, projectId, modelId, entryId))) {
                return void res.status(404).json({ error: 'Entry not found' });
            }
            const entry = await getEntryAtRevision(projectId, modelId, entryId, revisionId);
            if (!entry) {
                return void res.status(404).json({ error: 'Revision not found' });
            }
            return void res.json({ entry });
        } catch (err: unknown) {
            return void sendApiError(res, req, err);
        }
    }
);

router.post(
    '/:entryId/revisions/:revisionId/restore',
    requireProjectAccess,
    async (req: Request, res: Response) => {
        const { projectId, modelId, entryId, revisionId } = req.params as Record<string, string>;
        if (!projectId || !modelId || !entryId || !revisionId) {
            return void res.status(400).json({ error: 'Missing path parameters' });
        }
        try {
            const current = await getEntry(req.user!, projectId, modelId, entryId);
            const snapshot = await getEntryAtRevision(projectId, modelId, entryId, revisionId);
            if (!snapshot) {
                return void res.status(404).json({ error: 'Revision not found' });
            }
            // The old version is checked against today's model, leniently like any draft: an
            // empty required field is for review and publishing to catch, a value the model no
            // longer accepts is not.
            const modelSchema = await getModelSchema(req.user!, projectId, modelId);
            const proj = await getProjectById(projectId);
            const projectLocales = proj
                ? ([proj.defaultLocale, ...(proj.supportedLocales ?? [])].filter(
                      Boolean
                  ) as string[])
                : undefined;
            const validation = await validateEntry(
                projectId,
                { ...current, data: snapshot.data ?? {} },
                modelSchema,
                {
                    projectLocales: projectLocales?.length ? projectLocales : undefined,
                    allowHtmlIframe: proj?.allowHtmlIframe === true,
                    allowHtmlEmbed: proj?.allowHtmlEmbed === true,
                    draft: true
                }
            );
            if (!validation.valid) {
                return void res.status(400).json({
                    valid: false,
                    errors: validation.issues.map(issue => ({
                        field: issue.path,
                        message: issue.message
                    }))
                });
            }
            const { restored, changed } = await restoreEntryAtRevision(
                req.user!,
                projectId,
                modelId,
                entryId,
                revisionId
            );
            return void res.json({ entry: restored, changed });
        } catch (err: unknown) {
            return void sendApiError(res, req, err);
        }
    }
);

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/models/{modelId}/entries/{entryId}/revisions': {
        get: {
            summary: 'Get revision history for an entry (from git)',
            tags: ['Entries'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'modelId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'entryId', in: 'path', required: true, schema: { type: 'string' } },
                {
                    name: 'max',
                    in: 'query',
                    required: false,
                    schema: { type: 'integer', default: 20, maximum: 100 }
                }
            ],
            responses: {
                '200': {
                    description: 'Revision history (newest first)',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'array',
                                items: { $ref: '#/components/schemas/EntryRevision' }
                            }
                        }
                    }
                }
            }
        }
    },
    '/projects/{projectId}/models/{modelId}/entries/{entryId}/revisions/{revisionId}': {
        get: {
            summary: 'Get an entry as it was saved in one revision',
            tags: ['Entries'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'modelId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'entryId', in: 'path', required: true, schema: { type: 'string' } },
                {
                    name: 'revisionId',
                    in: 'path',
                    required: true,
                    description:
                        'Commit hash, from the revision list or meta.audit.publishedCommit',
                    schema: { type: 'string' }
                }
            ],
            responses: {
                '200': {
                    description: 'The entry at that revision',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: { entry: { $ref: '#/components/schemas/Entry' } }
                            }
                        }
                    }
                },
                '404': { description: 'Entry or revision not found' }
            }
        }
    },
    '/projects/{projectId}/models/{modelId}/entries/{entryId}/revisions/{revisionId}/restore': {
        post: {
            summary: 'Restore an entry to one revision',
            description:
                'Saves the content and helper marks of that revision as a new revision. Later revisions stay in the history. Status and the published version are unchanged.',
            tags: ['Entries'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'modelId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'entryId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'revisionId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description:
                        'The entry as restored. `changed` is false when it already matched that revision (nothing saved).',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    entry: { $ref: '#/components/schemas/Entry' },
                                    changed: { type: 'boolean' }
                                }
                            }
                        }
                    }
                },
                '400': { description: 'The revision no longer fits the model' },
                '403': { description: 'Not allowed to edit this entry' },
                '404': { description: 'Entry or revision not found' }
            }
        }
    }
};

export default router;
