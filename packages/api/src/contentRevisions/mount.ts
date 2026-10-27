import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import { getFileAtRevision, getFileRevisions } from '@moteurio/core/fileRevisions.js';
import { requireProjectAccess, requireProjectAdmin } from '../middlewares/auth.js';
import { sendApiError } from '../utils/apiError.js';

export type ContentRevisionMountOptions = {
    idParam: string;
    openApiPath: string;
    tag: string;
    responseKey: string;
    gitPath: (projectId: string, id: string) => string;
    assertExists: (req: Request) => Promise<void>;
    /** Saves the resource as it was in `revisionId` as a new revision (unless it is the same). */
    restore?: (
        req: Request,
        id: string,
        revisionId: string
    ) => Promise<{ restored: unknown; changed: boolean }>;
    /** What a restore keeps and whether it goes live, for the API docs. */
    restoreDescription?: string;
    /** Restoring changes how the site is built (layouts): admins only, like changing it. */
    restoreAdminOnly?: boolean;
};

function parseMax(raw: unknown): number {
    const maxStr =
        typeof raw === 'string'
            ? raw
            : Array.isArray(raw) && typeof raw[0] === 'string'
              ? raw[0]
              : '20';
    return Math.min(parseInt(maxStr, 10) || 20, 100);
}

export function createContentRevisionRouter(options: ContentRevisionMountOptions): Router {
    const router = Router({ mergeParams: true });
    const { idParam } = options;

    router.get(
        `/:${idParam}/revisions`,
        requireProjectAccess,
        async (req: Request, res: Response) => {
            const projectId = String(req.params.projectId);
            const id = String(req.params[idParam]);
            if (!projectId || !id) {
                return void res.status(400).json({ error: 'Missing path parameters' });
            }
            try {
                await options.assertExists(req);
                const revisions = getFileRevisions(
                    projectId,
                    options.gitPath(projectId, id),
                    parseMax(req.query.max)
                );
                return void res.json(revisions);
            } catch (err: unknown) {
                return void sendApiError(res, req, err);
            }
        }
    );

    router.get(
        `/:${idParam}/revisions/:revisionId`,
        requireProjectAccess,
        async (req: Request, res: Response) => {
            const projectId = String(req.params.projectId);
            const id = String(req.params[idParam]);
            const revisionId = String(req.params.revisionId);
            if (!projectId || !id || !revisionId) {
                return void res.status(400).json({ error: 'Missing path parameters' });
            }
            try {
                await options.assertExists(req);
                const body = getFileAtRevision(
                    projectId,
                    options.gitPath(projectId, id),
                    revisionId
                );
                if (!body) {
                    return void res.status(404).json({ error: 'Revision not found' });
                }
                return void res.json({ [options.responseKey]: body });
            } catch (err: unknown) {
                return void sendApiError(res, req, err);
            }
        }
    );

    const { restore } = options;
    if (restore) {
        router.post(
            `/:${idParam}/revisions/:revisionId/restore`,
            options.restoreAdminOnly ? requireProjectAdmin : requireProjectAccess,
            async (req: Request, res: Response) => {
                const id = String(req.params[idParam]);
                const revisionId = String(req.params.revisionId);
                if (!req.params.projectId || !id || !revisionId) {
                    return void res.status(400).json({ error: 'Missing path parameters' });
                }
                try {
                    const { restored, changed } = await restore(req, id, revisionId);
                    return void res.json({ [options.responseKey]: restored, changed });
                } catch (err: unknown) {
                    return void sendApiError(res, req, err);
                }
            }
        );
    }

    return router;
}

export function contentRevisionOpenApi(
    options: ContentRevisionMountOptions
): Record<string, OpenAPIV3.PathItemObject> {
    const base = options.openApiPath;
    const idName = options.idParam;
    const revItem = { $ref: '#/components/schemas/EntryRevision' };
    const body: OpenAPIV3.ResponseObject = {
        description: 'Resource at revision',
        content: {
            'application/json': {
                schema: {
                    type: 'object',
                    properties: {
                        [options.responseKey]: { type: 'object', additionalProperties: true }
                    }
                } as OpenAPIV3.SchemaObject
            }
        }
    };
    const restoredBody: OpenAPIV3.ResponseObject = {
        description:
            'The resource as restored. `changed` is false when it already matched that revision (nothing saved).',
        content: {
            'application/json': {
                schema: {
                    type: 'object',
                    properties: {
                        [options.responseKey]: { type: 'object', additionalProperties: true },
                        changed: { type: 'boolean' }
                    }
                } as OpenAPIV3.SchemaObject
            }
        }
    };
    const restorePath: Record<string, OpenAPIV3.PathItemObject> = options.restore
        ? {
              [`${base}/revisions/{revisionId}/restore`]: {
                  post: {
                      summary: 'Restore from one revision',
                      description: options.restoreDescription,
                      tags: [options.tag],
                      parameters: [
                          {
                              name: 'projectId',
                              in: 'path',
                              required: true,
                              schema: { type: 'string' }
                          },
                          { name: idName, in: 'path', required: true, schema: { type: 'string' } },
                          {
                              name: 'revisionId',
                              in: 'path',
                              required: true,
                              schema: { type: 'string' }
                          }
                      ],
                      responses: {
                          '200': restoredBody,
                          '400': { description: 'The revision no longer validates' },
                          '403': { description: 'Not allowed to edit it' },
                          '404': { description: 'Resource or revision not found' }
                      }
                  }
              }
          }
        : {};
    return {
        ...restorePath,
        [`${base}/revisions`]: {
            get: {
                summary: 'Revision history (from git)',
                tags: [options.tag],
                parameters: [
                    { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                    { name: idName, in: 'path', required: true, schema: { type: 'string' } },
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
                                schema: { type: 'array', items: revItem }
                            }
                        }
                    }
                }
            }
        },
        [`${base}/revisions/{revisionId}`]: {
            get: {
                summary: 'Resource as saved in one revision',
                tags: [options.tag],
                parameters: [
                    { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                    { name: idName, in: 'path', required: true, schema: { type: 'string' } },
                    {
                        name: 'revisionId',
                        in: 'path',
                        required: true,
                        schema: { type: 'string' }
                    }
                ],
                responses: {
                    '200': body,
                    '404': { description: 'Resource or revision not found' }
                }
            }
        }
    };
}
