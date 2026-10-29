import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import {
    deleteFromContentBin,
    emptyContentBin,
    listContentBin,
    restoreFromContentBin
} from '@moteurio/core/contentBinService.js';
import { requireProjectAccess } from '../middlewares/auth.js';
import { sendApiError } from '../utils/apiError.js';

/** The bin for entries and pages: list, take out (as a draft), delete for good. */
const router: Router = Router({ mergeParams: true });

type BinParams = { projectId: string; binId: string };

router.get('/:projectId/bin', requireProjectAccess, async (req: Request, res: Response) => {
    try {
        const { projectId } = req.params as BinParams;
        return void res.json({ items: await listContentBin(projectId, req.user!) });
    } catch (err) {
        return void sendApiError(res, req, err);
    }
});

router.post(
    '/:projectId/bin/:binId/restore',
    requireProjectAccess,
    async (req: Request, res: Response) => {
        try {
            const { projectId, binId } = req.params as BinParams;
            return void res.json(await restoreFromContentBin(projectId, req.user!, binId));
        } catch (err) {
            return void sendApiError(res, req, err);
        }
    }
);

router.delete(
    '/:projectId/bin/:binId',
    requireProjectAccess,
    async (req: Request, res: Response) => {
        try {
            const { projectId, binId } = req.params as BinParams;
            await deleteFromContentBin(projectId, req.user!, binId);
            return void res.status(204).end();
        } catch (err) {
            return void sendApiError(res, req, err);
        }
    }
);

router.delete('/:projectId/bin', requireProjectAccess, async (req: Request, res: Response) => {
    try {
        const { projectId } = req.params as BinParams;
        return void res.json({ deleted: await emptyContentBin(projectId, req.user!) });
    } catch (err) {
        return void sendApiError(res, req, err);
    }
});

const projectId: OpenAPIV3.ParameterObject = {
    name: 'projectId',
    in: 'path',
    required: true,
    schema: { type: 'string' }
};
const binId: OpenAPIV3.ParameterObject = {
    name: 'binId',
    in: 'path',
    required: true,
    description: '`entry.<modelId>.<entryId>.<ms>` or `page.<pageId>.<ms>`, from the list',
    schema: { type: 'string' }
};

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/bin': {
        get: {
            summary: 'What is in the bin',
            description:
                'Entries and pages deleted in the project, most recently deleted first, each with who deleted it and when. Any member.',
            tags: ['Bin'],
            security: [{ bearerAuth: [] }],
            parameters: [projectId],
            responses: {
                '200': {
                    description: '`{ items }`',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    items: {
                                        type: 'array',
                                        items: { $ref: '#/components/schemas/BinItem' }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        delete: {
            summary: 'Empty the bin',
            description: 'Everything in the bin deleted for good. Content leads and admins.',
            tags: ['Bin'],
            security: [{ bearerAuth: [] }],
            parameters: [projectId],
            responses: {
                '200': {
                    description: 'How many were deleted',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: { deleted: { type: 'integer' } }
                            }
                        }
                    }
                },
                '403': { description: 'Neither a content lead nor an admin' }
            }
        }
    },
    '/projects/{projectId}/bin/{binId}/restore': {
        post: {
            summary: 'Take something out of the bin',
            description:
                'Back as a draft (an entry that was live comes back unpublished): putting it on the site again goes through publishing and its review. A page whose parent is gone comes back at the top level. 409 while its model is gone, or another entry or page has its id or address. Whoever may write.',
            tags: ['Bin'],
            security: [{ bearerAuth: [] }],
            parameters: [projectId, binId],
            responses: {
                '200': {
                    description: '`{ kind: "entry", modelId, entry }` or `{ kind: "page", page }`',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['kind'],
                                properties: {
                                    kind: { type: 'string', enum: ['entry', 'page'] },
                                    modelId: { type: 'string' },
                                    entry: { $ref: '#/components/schemas/Entry' },
                                    page: { $ref: '#/components/schemas/CollectionPageNode' }
                                }
                            }
                        }
                    }
                },
                '404': { description: 'Nothing in the bin has this id' },
                '409': { description: 'The project changed since: see the message' }
            }
        }
    },
    '/projects/{projectId}/bin/{binId}': {
        delete: {
            summary: 'Delete something in the bin for good',
            description:
                'Content leads and admins. It can’t be undone (Git history keeps what was committed).',
            tags: ['Bin'],
            security: [{ bearerAuth: [] }],
            parameters: [projectId, binId],
            responses: {
                '204': { description: 'Deleted for good' },
                '403': { description: 'Neither a content lead nor an admin' },
                '404': { description: 'Nothing in the bin has this id' }
            }
        }
    }
};

export const schemas: OpenAPIV3.ComponentsObject['schemas'] = {
    BinItem: {
        type: 'object',
        required: ['id', 'kind', 'binned'],
        properties: {
            id: { type: 'string' },
            kind: { type: 'string', enum: ['entry', 'page'] },
            modelId: { type: 'string', description: 'An entry’s model' },
            binned: {
                type: 'object',
                required: ['at'],
                properties: {
                    at: { type: 'string', format: 'date-time' },
                    by: { type: 'string', description: 'Who deleted it (user id)' },
                    byName: { type: 'string' }
                }
            },
            entry: { $ref: '#/components/schemas/Entry' },
            page: { $ref: '#/components/schemas/CollectionPageNode' }
        }
    }
};

export default router;
