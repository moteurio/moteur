import type { Request, Response } from 'express';
import { Router } from 'express';
import { queryEntries } from '@moteurio/core/entries.js';
import { getModelSchema } from '@moteurio/core/models.js';
import { resolveEntryAssets } from '@moteurio/core/assets/assetResolver.js';
import { resolveEntryUrl } from '@moteurio/core/pages.js';
import type { OpenAPIV3 } from 'openapi-types';
import { requireProjectAccess } from '../middlewares/auth.js';
import { sendApiError } from '../utils/apiError.js';
import type { EntryQuery } from '@moteurio/core/contentIndex/index.js';
import { entryQueryParameters, parseEntryQuery } from '../utils/entryQuery.js';
import { queryFlag } from '../utils/queryFlag.js';

const router: Router = Router({ mergeParams: true });

router.get('/', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, modelId } = req.params as Record<string, string>;

    if (!projectId || !modelId) {
        return void res.status(400).json({ error: 'Missing projectId or modelId in path' });
    }

    let parsed: EntryQuery;
    try {
        parsed = parseEntryQuery(req, { allowStatus: true, allowList: true });
    } catch (err: unknown) {
        return void res.status(400).json({ error: (err as Error).message });
    }

    try {
        const result = await queryEntries(req.user!, projectId, modelId, parsed);
        let entries = result.items;
        if (queryFlag(req.query.resolveAssets)) {
            const schema = await getModelSchema(req.user!, projectId, modelId);
            entries = await Promise.all(entries.map(e => resolveEntryAssets(projectId, e, schema)));
        }
        if (queryFlag(req.query.resolveUrl)) {
            entries = await Promise.all(
                entries.map(async e => {
                    const url = await resolveEntryUrl(projectId, e.id, modelId);
                    return { ...e, ...(url != null && { resolvedUrl: url }) };
                })
            );
        }
        return void res.json({
            entries,
            total: result.total,
            ...(result.facets && { facets: result.facets }),
            ...(result.missingCounts && { missingCounts: result.missingCounts })
        });
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/models/{modelId}/entries': {
        get: {
            summary: 'List entries for a model',
            tags: ['Entries'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'modelId', in: 'path', required: true, schema: { type: 'string' } },
                ...entryQueryParameters({ allowStatus: true, allowList: true })
            ],
            responses: {
                '200': {
                    description: 'List of entries',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/EntriesListResponse' }
                        }
                    }
                },
                '400': {
                    description: 'Missing or invalid parameters',
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
